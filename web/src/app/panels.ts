// v3 department panels over the office were removed in v4 (spec-v4 L14): the department's work now lives
// in the Now card (now.ts). This module keeps the old entry point for anything that still imports it.
export { highlight as deptHighlight, miniChart } from "./now";
