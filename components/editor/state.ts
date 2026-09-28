"use client";

import { useCallback, useReducer } from "react";
import type { Field, FieldType } from "@/lib/pdf/fields";

export type EditorField = Field;

type State = {
  past: EditorField[][];
  present: EditorField[];
  future: EditorField[][];
  selectedId: string | null;
  /** Nombre de modifications depuis le chargement (déclenche l'enregistrement du brouillon). */
  revision: number;
};

type Action =
  | { type: "set"; fields: EditorField[]; commit: boolean }
  | { type: "commit"; before: EditorField[] }
  | { type: "select"; id: string | null }
  | { type: "undo" }
  | { type: "redo" };

const LIMIT = 80;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set":
      // commit = false : changement « en direct » (glisser) ; l'historique est poussé au relâchement.
      return action.commit
        ? {
            ...state,
            past: [...state.past, state.present].slice(-LIMIT),
            present: action.fields,
            future: [],
            revision: state.revision + 1,
          }
        : { ...state, present: action.fields };
    case "commit":
      return {
        ...state,
        past: [...state.past, action.before].slice(-LIMIT),
        future: [],
        revision: state.revision + 1,
      };
    case "select":
      return { ...state, selectedId: action.id };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        selectedId: previous.some((f) => f.id === state.selectedId) ? state.selectedId : null,
        revision: state.revision + 1,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
        revision: state.revision + 1,
      };
    }
  }
}

export function useEditorState<F extends EditorField = EditorField>(initial: F[]) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initial, future: [], selectedId: null, revision: 0 });

  const update = useCallback((fields: F[], commit = true) => dispatch({ type: "set", fields, commit }), []);
  const commitFrom = useCallback((before: F[]) => dispatch({ type: "commit", before }), []);
  const select = useCallback((id: string | null) => dispatch({ type: "select", id }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  return {
    fields: state.present as F[],
    selectedId: state.selectedId,
    selected: (state.present.find((f) => f.id === state.selectedId) ?? null) as F | null,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    revision: state.revision,
    update,
    commitFrom,
    select,
    undo,
    redo,
  };
}

export const newFieldId = () => crypto.randomUUID().slice(0, 12);

/** Taille par défaut (en % de la page affichée) selon le type d'élément. */
export function defaultSize(type: FieldType, pageAspect: number, assetAspect?: number): { w: number; h: number } {
  // pageAspect = largeur / hauteur de la page affichée ; assetAspect = largeur / hauteur de l'image.
  const heightFor = (w: number, aspect: number) => (w * pageAspect) / aspect;
  switch (type) {
    case "signature":
      return { w: 26, h: heightFor(26, assetAspect ?? 3) };
    case "initials":
      return { w: 11, h: heightFor(11, assetAspect ?? 1.6) };
    case "stamp":
      return { w: 20, h: heightFor(20, assetAspect ?? 1) };
    case "checkbox":
      return { w: 3, h: heightFor(3, 1) };
    case "date":
      return { w: 36, h: 2.4 };
    case "name":
      return { w: 30, h: 2.4 };
    case "mention":
      return { w: 26, h: 2.4 };
    case "text":
      return { w: 34, h: 2.4 };
  }
}

/** Aimantation : bords et centres de la page et des autres champs (seuil en %). */
export function snap(
  value: number,
  size: number,
  targets: number[],
  threshold = 0.8,
): { value: number; guide: number | null } {
  const edges = [
    { offset: 0, pos: value },
    { offset: size / 2, pos: value + size / 2 },
    { offset: size, pos: value + size },
  ];
  let best: { value: number; guide: number; distance: number } | null = null;
  for (const edge of edges) {
    for (const target of targets) {
      const distance = Math.abs(edge.pos - target);
      if (distance < threshold && (!best || distance < best.distance)) {
        best = { value: target - edge.offset, guide: target, distance };
      }
    }
  }
  return best ? { value: best.value, guide: best.guide } : { value, guide: null };
}
