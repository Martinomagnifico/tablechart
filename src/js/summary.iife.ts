import { Summary } from "./summary";

// For a <script> tag after the one of Tablechart: `Tablechart.Summary.init()`.
(window as unknown as { Tablechart: { Summary?: typeof Summary } }).Tablechart.Summary = Summary;
