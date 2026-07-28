import {
  helloVoid,
  helloError,
  helloStr,
  helloNum,
  helloArrayStr,
  helloObj,
} from "../utils/samples";
export { helloError, helloStr, helloNum, helloArrayStr, helloObj, helloVoid };
import { dispatchTS } from "../utils/utils";
import { applyEasing } from "./easing";
export { applyEasing };
import {
  setAnchorPoint,
  setLayerAnchor,
  setShapeGroupAnchor,
} from "./anchor";
export { setAnchorPoint, setLayerAnchor, setShapeGroupAnchor };
import { sequenceLayers } from "./sequence";
export { sequenceLayers };
import { applyExpression, clearExpressions } from "./expressions";
export { applyExpression, clearExpressions };
import { cleanAll, removeArtboardRect, removeEmptyGroups } from "./shape";
export { cleanAll, removeArtboardRect, removeEmptyGroups };
import { applyLoop } from "./loop";
export { applyLoop };

export const helloWorld = () => {
  alert("Hello from After Effects!");
  app.project.activeItem;
};
