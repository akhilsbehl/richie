export type Position = { line: number; column: number; offset: number };
export type Range = { start: Position; end: Position };
export type OperationKind = "delete" | "replace" | "comment";
export type OperationStatus = "open" | "applied" | "rejected" | "needs-review" | "superseded";
export type Scope = "range" | "block" | "section" | "document" | "cell" | "row" | "column" | "media";
export type DocumentKind = "markdown" | "html";
export type HtmlRect = { viewport: { x: number; y: number; width: number; height: number }; document: { x: number; y: number; width: number; height: number }; viewportSize: { width: number; height: number } };
export type HtmlBoundary = { selector: string; path: number[]; offset: number };
export type HtmlTarget =
 | { type: "html-element"; selector: string; path: number[]; tag: string; text: string; rect: HtmlRect }
 | { type: "html-text-range"; selector: string; commonAncestorSelector: string; start: HtmlBoundary; end: HtmlBoundary; text: string; exactText: string; rect: HtmlRect }
 | { type: "mermaid-node"; diagramId: string; nodeId: string; label: string; selector: string; rect: HtmlRect };

export type ReviewOperation = {
  id: string;
  kind: OperationKind;
  status: OperationStatus;
  scope: Scope;
  range?: Range;
  target?: HtmlTarget;
  quote?: string;
  prefix?: string;
  suffix?: string;
  blockId?: string;
  headingPath?: string[];
  replacement?: string;
  comment?: string;
  placement?: "start" | "end";
  createdAt: string;
  updatedAt?: string;
};

export type ReviewOutcome =
  | { status: "finished"; file: string }
  | { status: "aborted" };

export type ReviewState = {
  schemaVersion: 1;
  source: string;
  /** Always present in normalized in-memory state; legacy JSON may omit it at parse time. */
  documentKind: DocumentKind;
  sourceSha256: string;
  createdAt: string;
  operations: ReviewOperation[];
};

export type Session = {
  id: string;
  token: string;
  sourcePath: string;
  source: string;
  documentKind: DocumentKind;
  artifactNonce: string;
  sidecarPath: string;
  state: ReviewState;
  outcome?: ReviewOutcome;
};
