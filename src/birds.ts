import type { BirdId } from "./flightTypes";
export type BirdSpec = {
  id: BirdId;
  name: string;
  span: number;
  length: number;
  body: number;
  colors: number[];
  published: { label: string; value: string }[];
  source: string;
};
export const BIRDS: Record<BirdId, BirdSpec> = {
  "black-kite": {
    id: "black-kite",
    name: "Black kite (Milvus migrans)",
    span: 1.5,
    length: 0.58,
    body: 0.19,
    colors: [0x49382b, 0x36291e, 0x7b6852],
    published: [
      { label: "Wingspan", value: "≈ 150 cm" },
      { label: "Length", value: "50–60 cm" },
    ],
    source: "https://animaldiversity.org/accounts/Milvus_migrans/",
  },
  "house-crow": {
    id: "house-crow",
    name: "House crow (Corvus splendens)",
    span: 0.85,
    length: 0.42,
    body: 0.13,
    colors: [0x15181c, 0x111318, 0x69696b],
    published: [{ label: "Length", value: "41–43 cm" }],
    source:
      "https://invasivespeciesni.co.uk/wp-content/uploads/2025/03/NIEA-ID-Guide-Corvus-splendens-Indian-House-Crow.pdf",
  },
  "rock-pigeon": {
    id: "rock-pigeon",
    name: "Rock pigeon (Columba livia)",
    span: 0.62,
    length: 0.33,
    body: 0.1,
    colors: [0x858d96, 0x606872, 0x465e62],
    published: [
      { label: "Length", value: "30–36 cm" },
      { label: "Wingspan", value: "50–67 cm" },
    ],
    source: "https://www.allaboutbirds.org/guide/rock_pigeon/id",
  },
};
