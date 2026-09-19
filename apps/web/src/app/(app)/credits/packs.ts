export interface Pack {
  id: string;
  name: string;
  credits: number;
  bonusCredits: number;
  priceUsdCents: number;
}

export const PACKS: Pack[] = [
  { id: "pack-1000", name: "Starter", credits: 1000, bonusCredits: 0, priceUsdCents: 1000 },
  { id: "pack-2750", name: "Plus", credits: 2750, bonusCredits: 250, priceUsdCents: 2500 },
  { id: "pack-6000", name: "Pro Pack", credits: 6000, bonusCredits: 750, priceUsdCents: 5000 },
  { id: "pack-13000", name: "Studio Pack", credits: 13000, bonusCredits: 2000, priceUsdCents: 10000 },
  { id: "pack-35000", name: "Agency Pack", credits: 35000, bonusCredits: 6000, priceUsdCents: 25000 },
];
