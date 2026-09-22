const modifierMap = {
  left:          '좌회전',
  right:         '우회전',
  straight:      '직진',
  'slight left':  '약간 좌회전',
  'slight right': '약간 우회전',
  'sharp left':   '급좌회전',
  'sharp right':  '급우회전',
  uturn:         'U턴',
};

const typeMap = {
  depart:     '출발',
  arrive:     '도착',
  continue:   '직진',
  merge:      '합류',
  fork:       '분기',
  roundabout: '로터리',
};

/**
 * OSRM step → 자연스러운 한국어 안내 문구
 * 예) "석정로에서 좌회전하세요" / "중앙로를 따라 직진하세요" / "목적지에 도착했습니다"
 */
export function getInstruction(step) {
  const modifier = modifierMap[step.modifier];
  const name = step.name ? `${step.name}에서 ` : '';

  if (step.instruction === 'arrive') {
    return step.name ? `${step.name}에 도착했습니다` : '목적지에 도착했습니다';
  }

  if (step.instruction === 'depart') {
    return step.name ? `${step.name} 방면으로 출발하세요` : '출발하세요';
  }

  if (modifier) {
    if (modifier === '직진') {
      return step.name ? `${step.name} 따라 직진하세요` : '직진하세요';
    }
    return `${name}${modifier}하세요`;
  }

  const type = typeMap[step.instruction] || step.instruction;
  return step.name ? `${step.name}에서 ${type}` : type;
}

/** 거리(m)를 표시용 문자열로 포맷 */
export function formatDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

/** action 문자열 반환 (예고 안내용) */
export function getAction(step) {
  return modifierMap[step.modifier] || typeMap[step.instruction] || step.instruction;
}