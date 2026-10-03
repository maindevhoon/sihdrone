// Stable numbered library. Seed values are spread over the full unsigned range.
export const VARIATION_SEEDS = Array.from({length:200},(_,index)=>Math.imul(index+1,2654435761)>>>0);
export function shuffledVariations(random:()=>number=Math.random):number[] {
  const values=[...VARIATION_SEEDS];
  for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
  return values;
}
export function createVariationDeck(random:()=>number=Math.random) {
  let deck:number[]=[];
  return {next(current?:number){
    if(!deck.length)deck=shuffledVariations(random);
    // Defer the current variation rather than discarding it from this cycle.
    if(deck.at(-1)===current&&deck.length>1)deck.unshift(deck.pop()!);
    const value=deck.pop()!;
    if(value===current){deck=shuffledVariations(random);if(deck.at(-1)===current)deck.unshift(deck.pop()!);return deck.pop()!;}
    return value;
  }};
}
export function variationNumber(seed:number){const index=VARIATION_SEEDS.indexOf(seed);return index<0?null:index+1;}
