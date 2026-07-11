export type ValidationCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type ImportedPet = {
  packageDir: string;
  sourceKind: string;
  id: string;
  displayName: string;
  description: string;
  format: string;
  spriteVersionNumber: number;
  spritesheetPath: string;
  spriteDataUrl: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: ValidationCheck[];
};

export type ExportResult = {
  folderPath: string;
  zipPath: string;
  executablePath: string;
  platform: string;
};

export type SourceExportResult = {
  folderPath: string;
  zipPath: string;
  includedBuilder: string;
};

export type PetStateId =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";
