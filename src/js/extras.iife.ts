import { scatter } from "./extras";

// For a <script> tag after the one of Tablechart: the types are there for `Tablechart.init()`.
(window as unknown as { Tablechart: { addType: (name: string, type: unknown) => void } }).Tablechart.addType("scatter", scatter);
