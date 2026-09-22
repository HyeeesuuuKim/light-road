from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncpg
import asyncio
import httpx
import json
import time

# ── DB 커넥션 풀 ──────────────────────────────────────────────────────────────
pool: asyncpg.Pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(
        database="lightroad",
        user="dongeun",
        password="qazxcv62",
        host="localhost",
        port=5432,
        min_size=3,
        max_size=10,
    )
    yield
    await pool.close()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "http://127.0.0.1:3000",
        "https://127.0.0.1:3000",
        "https://10.70.62.137:3000",
        "http://10.70.62.137:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OSRM_URL = "http://127.0.0.1:5000"

# ── WKT LineString 생성 헬퍼 ──────────────────────────────────────────────────
def make_line_wkt(positions):
    line_points = ", ".join([f"{c[1]} {c[0]}" for c in positions])
    return f"LINESTRING({line_points})"

# ── 경로 한 개의 lights/cctv 쿼리를 병렬 실행 ────────────────────────────────
# asyncio.gather()로 두 쿼리를 동시에 실행 → 순차 실행 대비 약 2배 빠름
async def calc_route_score(line_wkt: str, distance_km: float):
    async with pool.acquire() as conn1, pool.acquire() as conn2:
        lights_rows, cctv_rows = await asyncio.gather(
            conn1.fetch("""
                SELECT lat, lng FROM lights
                WHERE ST_DWithin(geom::geography, ST_GeogFromText($1), $2)
            """, line_wkt, 50),
            conn2.fetch("""
                SELECT lat, lng FROM cctv
                WHERE ST_DWithin(geom::geography, ST_GeogFromText($1), $2)
            """, line_wkt, 50),
        )
    lights_count = len(lights_rows)
    cctv_count   = len(cctv_rows)

    # ── 안전 점수 계산 (거리 정규화) ────────────────────────────────────────
    # 공식: score = (가로등 × 0.7 + CCTV × 0.3) / 경로거리(km)
    #
    # 가중치 근거:
    #   가로등(0.7): 조명은 범죄 자체를 억제하는 직접 효과 (CPTED 원칙)
    #   CCTV(0.3):  사후 증거 확보 기능이 주 — 억제 효과는 조명보다 낮음
    #
    # 거리로 나누는 이유(정규화):
    #   단순 합산은 긴 경로가 시설물 수 자체가 많아 무조건 유리해짐.
    #   km당 밀도로 변환하면 경로 길이와 무관하게 공정 비교 가능.
    #   예) 1km 경로 가로등 10개 vs 2km 경로 가로등 14개
    #       정규화 전: 7.0 vs 9.8  → 긴 경로 승리 (불공정)
    #       정규화 후: 7.0 vs 4.9  → 밀도 높은 경로 승리 (공정)
    score = round((lights_count * 0.7 + cctv_count * 0.3) / max(distance_km, 0.1), 2)
    return lights_count, cctv_count, score

@app.get("/")
def root():
    return {"message": "Light-Road API 작동 중"}

@app.get("/nearby")
async def get_nearby(lat: float, lng: float, radius: int = 200):
    async with pool.acquire() as conn1, pool.acquire() as conn2:
        lights_count, cctv_count = await asyncio.gather(
            conn1.fetchval("""
                SELECT COUNT(*) FROM lights
                WHERE ST_DWithin(
                    geom::geography,
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                    $3
                )
            """, lng, lat, radius),
            conn2.fetchval("""
                SELECT COUNT(*) FROM cctv
                WHERE ST_DWithin(
                    geom::geography,
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                    $3
                )
            """, lng, lat, radius),
        )
    score = round(lights_count * 0.7 + cctv_count * 0.3, 2)
    return {"lights": lights_count, "cctv": cctv_count, "score": score}

@app.get("/nearest")
async def get_nearest(lat: float, lng: float):
    """
    현재 위치에서 가장 가까운 안전시설(경찰서·CCTV·비상벨)까지의 거리 조회

    각 시설 종류별로 ST_Distance로 최근접 1개씩 조회하여
    거리(m)와 좌표를 반환. 상단 실시간 안전 배지에 사용.

    [ORDER BY <-> 연산자]
    PostGIS의 <-> 는 KNN(K-Nearest Neighbor) 거리 연산자로,
    GiST 인덱스를 활용해 가장 가까운 점을 빠르게 찾음.
    """
    async def nearest(conn, table):
        row = await conn.fetchrow(f"""
            SELECT lat, lng,
                   ST_Distance(geom::geography, ST_GeogFromText($1)) AS dist
            FROM {table}
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint($2, $3), 4326)
            LIMIT 1
        """, f"POINT({lng} {lat})", lng, lat)
        if row is None:
            return None
        return {"lat": row["lat"], "lng": row["lng"], "dist": round(row["dist"])}

    async with (
        pool.acquire() as c1,
        pool.acquire() as c2,
        pool.acquire() as c3,
    ):
        police, cctv, bell = await asyncio.gather(
            nearest(c1, "police"),
            nearest(c2, "cctv"),
            nearest(c3, "bell"),
        )

    return {"police": police, "cctv": cctv, "bell": bell}

@app.get("/geocode")
async def geocode(address: str):
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": address, "format": "json", "limit": 1, "countrycodes": "kr"}
    headers = {"User-Agent": "light-road-app"}

    async with httpx.AsyncClient() as client:
        res = await client.get(url, headers=headers, params=params)
        data = res.json()

    try:
        item = data[0]
        return {"lat": float(item["lat"]), "lng": float(item["lon"]), "address": item["display_name"]}
    except Exception as e:
        return {"error": str(e)}

@app.get("/route")
async def get_route(
    start_lat: float, start_lng: float,
    end_lat: float, end_lng: float
):
    url = f"{OSRM_URL}/route/v1/foot/{start_lng},{start_lat};{end_lng},{end_lat}"
    params = {
        "overview":     "full",
        "geometries":   "geojson",
        "alternatives": "3",
        "steps":        "true",
    }
    t0 = time.perf_counter()
    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params)
        data = res.json()
        print(f"[route] OSRM 호출: {time.perf_counter() - t0:.3f}초")
        
    try:
        # OSRM이 경로를 못 찾는 경우 방어 (장동은 추가)
        if "routes" not in data or not data["routes"]:
            return {"error": f"OSRM 경로 없음: {data.get('code', 'unknown')}"}

        # 후보 경로 파싱
        parsed = []
        for route in data["routes"]:
            coords = route["geometry"]["coordinates"]
            positions = [[c[1], c[0]] for c in coords]
            
            # steps 파싱
            steps = []
            for leg in route["legs"]:
                for step in leg["steps"]:
                    steps.append({
                        "instruction": step["maneuver"]["type"],
                        "modifier":    step["maneuver"].get("modifier", ""),
                        "name":        step.get("name", ""),
                        "distance":    step["distance"],
                        "lat":         step["maneuver"]["location"][1],
                        "lng":         step["maneuver"]["location"][0],
                    })

            parsed.append({
                "positions":   positions,
                "steps":       steps,
                "distance_km": max(route["distance"] / 1000, 0.1),
                "distance":    round(route["distance"] / 1000, 2),
                "duration":    round(route["duration"] / 60, 1),
                "line_wkt":    make_line_wkt(positions),
            })

        # 모든 후보 경로의 score를 asyncio.gather()로 병렬 계산
        t1 = time.perf_counter()
        scores = await asyncio.gather(*[
            calc_route_score(r["line_wkt"], r["distance_km"]) for r in parsed
        ])
        print(f"[route] 후보 {len(parsed)}개 점수계산(DB): {time.perf_counter() - t1:.3f}초")
        print(f"[route] 결과: {[(l, c, s) for l, c, s in scores]}  (가로등, CCTV, 점수)")

        routes = []
        for r, (lights_count, cctv_count, score) in zip(parsed, scores):
            routes.append({
                "positions": r["positions"],
                "distance":  r["distance"],
                "duration":  r["duration"],
                "steps":     r["steps"],
                "lights":    lights_count,
                "cctv":      cctv_count,
                "score":     score,
            })

        routes.sort(key=lambda r: r["score"], reverse=True)
        return {"routes": routes}
    except Exception as e:
        return {"error": str(e)}

@app.get("/markers")
async def get_markers(positions: str, radius: int = 50):
    coords   = json.loads(positions)
    line_wkt = make_line_wkt(coords)

    async with (
        pool.acquire() as c1,
        pool.acquire() as c2,
        pool.acquire() as c3,
        pool.acquire() as c4,
    ):
        lights_rows, cctv_rows, police_rows, bell_rows = await asyncio.gather(
            c1.fetch("SELECT lat, lng, address FROM lights WHERE ST_DWithin(geom::geography, ST_GeogFromText($1), $2)", line_wkt, radius),
            c2.fetch("SELECT lat, lng, address FROM cctv   WHERE ST_DWithin(geom::geography, ST_GeogFromText($1), $2)", line_wkt, radius),
            c3.fetch("SELECT lat, lng, name, address FROM police WHERE ST_DWithin(geom::geography, ST_GeogFromText($1), $2)", line_wkt, radius),
            c4.fetch("SELECT lat, lng, address FROM bell   WHERE ST_DWithin(geom::geography, ST_GeogFromText($1), $2)", line_wkt, radius),
        )

    return {
        "lights": [dict(r) for r in lights_rows],
        "cctv":   [dict(r) for r in cctv_rows],
        "police": [dict(r) for r in police_rows],
        "bell":   [dict(r) for r in bell_rows],
    }

@app.get("/all-markers")
async def get_all_markers():
    async with (
        pool.acquire() as c1,
        pool.acquire() as c2,
        pool.acquire() as c3,
        pool.acquire() as c4,
    ):
        lights_rows, cctv_rows, police_rows, bell_rows = await asyncio.gather(
            c1.fetch("SELECT lat, lng, address FROM lights"),
            c2.fetch("SELECT lat, lng, address FROM cctv"),
            c3.fetch("SELECT lat, lng, name, address FROM police"),
            c4.fetch("SELECT lat, lng, address FROM bell"),
        )

    return {
        "lights": [dict(r) for r in lights_rows],
        "cctv":   [dict(r) for r in cctv_rows],
        "police": [dict(r) for r in police_rows],
        "bell":   [dict(r) for r in bell_rows],
    }