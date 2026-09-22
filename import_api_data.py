import requests
import psycopg2
import os
import time

API_KEY = os.getenv("GG_API_KEY")
BASE_URL = "https://openapi.gg.go.kr"

DB_CONFIG = {
    "dbname": "lightroad",
    "user": "dongeun",
    "host": "localhost",
    "port": "5432",
}

def get_conn():
    return psycopg2.connect(**DB_CONFIG)

def fetch_all(endpoint, key_name, pSize=1000):
    all_items = []
    pIndex = 1
    while True:
        url = f"{BASE_URL}/{endpoint}"
        params = {"KEY": API_KEY, "Type": "json", "pIndex": pIndex, "pSize": pSize}
        try:
            res = requests.get(url, params=params, timeout=30)
            res.raise_for_status()
            data = res.json()
            items = data[key_name][1]["row"]
            all_items.extend(items)
            total = data[key_name][0]["head"][0]["list_total_count"]
            print(f"{endpoint} - {len(all_items)}/{total} 로드됨")
            if len(all_items) >= total:
                break
            pIndex += 1
        except (requests.RequestException, KeyError, IndexError) as e:
            print(f"오류 (pIndex={pIndex}): {e} - 재시도 중...")
            time.sleep(2)
            continue
    return all_items

def bulk_insert(cur, sql, items, extract_fn):
    success = 0
    for item in items:
        try:
            params = extract_fn(item)
            cur.execute(sql, params)
            success += 1
        except (ValueError, KeyError) as e:
            print(f"  행 스킵: {e}")
            continue
    return success

def import_police():
    print("경찰서 데이터 가져오는 중...")
    items = fetch_all("Polcsttnstus", "Polcsttnstus")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM police")
    sql = "INSERT INTO police (name, address, lat, lng, geom) VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))"
    count = bulk_insert(cur, sql, items, lambda i: (
        i.get("POLICE_OFFICE_NM", ""),
        i.get("REFINE_ROADNM_ADDR", ""),
        float(i["REFINE_WGS84_LAT"]),
        float(i["REFINE_WGS84_LOGT"]),
        float(i["REFINE_WGS84_LOGT"]),
        float(i["REFINE_WGS84_LAT"]),
    ))
    conn.commit()
    cur.close()
    conn.close()
    print(f"경찰서 {count}개 저장 완료!")

def import_bell():
    print("안전비상벨 데이터 가져오는 중...")
    items = fetch_all("Safeemrgncbell", "Safeemrgncbell")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM bell")
    sql = "INSERT INTO bell (address, lat, lng, geom) VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))"
    count = bulk_insert(cur, sql, items, lambda i: (
        i.get("REFINE_ROADNM_ADDR", ""),
        float(i["REFINE_WGS84_LAT"]),
        float(i["REFINE_WGS84_LOGT"]),
        float(i["REFINE_WGS84_LOGT"]),
        float(i["REFINE_WGS84_LAT"]),
    ))
    conn.commit()
    cur.close()
    conn.close()
    print(f"안전비상벨 {count}개 저장 완료!")

def import_cctv():
    print("CCTV 데이터 가져오는 중...")
    items = fetch_all("CCTV", "CCTV")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM cctv")
    sql = "INSERT INTO cctv (address, lat, lng, geom) VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))"
    count = bulk_insert(cur, sql, items, lambda i: (
        i.get("REFINE_ROADNM_ADDR", ""),
        float(i["REFINE_WGS84_LAT"]),
        float(i["REFINE_WGS84_LOGT"]),
        float(i["REFINE_WGS84_LOGT"]),
        float(i["REFINE_WGS84_LAT"]),
    ))
    conn.commit()
    cur.close()
    conn.close()
    print(f"CCTV {count}개 저장 완료!")

def import_lights():
    print("보안등 데이터 가져오는 중...")
    items = fetch_all("SECRTLGT", "SECRTLGT")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM lights")
    sql = "INSERT INTO lights (name, address, lat, lng, geom) VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))"
    count = bulk_insert(cur, sql, items, lambda i: (
        i.get("INSTL_PLACE_NM", ""),
        i.get("REFINE_ROADNM_ADDR", ""),
        float(i["REFINE_WGS84_LAT"]),
        float(i["REFINE_WGS84_LOGT"]),
        float(i["REFINE_WGS84_LOGT"]),
        float(i["REFINE_WGS84_LAT"]),
    ))
    conn.commit()
    cur.close()
    conn.close()
    print(f"보안등 {count}개 저장 완료!")

if __name__ == "__main__":
    import_cctv()
    import_lights()
    import_police()
    import_bell()
    print("전체 완료!")
