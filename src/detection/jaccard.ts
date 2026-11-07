const EMPTY_SIZE = 0;
const INCREMENT_STEP = 1;
const ZERO_SIMILARITY = 0;

export function calculateJaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
  const isBothEmpty = setA.size === EMPTY_SIZE && setB.size === EMPTY_SIZE;
  if (isBothEmpty) {
    return ZERO_SIMILARITY;
  }

  const isEitherEmpty = setA.size === EMPTY_SIZE || setB.size === EMPTY_SIZE;
  if (isEitherEmpty) {
    return ZERO_SIMILARITY;
  }

  const [smallerSet, largerSet] = setA.size <= setB.size ? [setA, setB] : [setB, setA];

  let intersectionSize = EMPTY_SIZE;
  for (const element of smallerSet) {
    if (largerSet.has(element)) {
      intersectionSize += INCREMENT_STEP;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  const isUnionEmpty = unionSize === EMPTY_SIZE;
  if (isUnionEmpty) {
    return ZERO_SIMILARITY;
  }

  return intersectionSize / unionSize;
}
