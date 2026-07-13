import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import {
  createPanelLayoutController,
  normalizePanelLayout
} from "../src/panel_layout.js";

const setup = ({ initialLayout } = {}) => {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="panel">
      <header id="handle"><button id="button">button</button></header>
      <div id="resize"></div>
    </section>
  </body>`, { pretendToBeVisual: true });
  Object.defineProperty(dom.window, "innerWidth", { value: 1000, writable: true });
  Object.defineProperty(dom.window, "innerHeight", { value: 700, writable: true });
  const root = dom.window.document.querySelector("#panel");
  root.style.position = "fixed";
  const changes = [];
  const controller = createPanelLayoutController({
    pageWindow: dom.window,
    root,
    dragHandle: dom.window.document.querySelector("#handle"),
    resizeHandle: dom.window.document.querySelector("#resize"),
    initialLayout,
    onLayoutChange: (layout) => changes.push(layout)
  });
  return { dom, root, controller, changes };
};

const pointer = (window, target, type, x, y) => {
  target.dispatchEvent(new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y
  }));
};

test("normalizes saved layout and clamps corrupt coordinates into the viewport", () => {
  assert.deepEqual(normalizePanelLayout({
    left: 9000,
    top: -100,
    width: 2000,
    height: 10,
    collapsed: true
  }, { width: 1000, height: 700 }), {
    left: 8,
    top: 8,
    width: 984,
    height: 220,
    collapsed: true
  });
});

test("drags from the title bar and ignores interactive controls", () => {
  const { dom, root, controller, changes } = setup({
    initialLayout: { left: 600, top: 300, width: 380, height: 360, collapsed: false }
  });
  const handle = dom.window.document.querySelector("#handle");
  const button = dom.window.document.querySelector("#button");

  pointer(dom.window, button, "pointerdown", 610, 310);
  pointer(dom.window, dom.window, "pointermove", 300, 200);
  pointer(dom.window, dom.window, "pointerup", 300, 200);
  assert.equal(root.style.left, "600px");

  pointer(dom.window, handle, "pointerdown", 620, 320);
  pointer(dom.window, dom.window, "pointermove", 420, 220);
  pointer(dom.window, dom.window, "pointerup", 420, 220);
  assert.equal(root.style.left, "400px");
  assert.equal(root.style.top, "200px");
  assert.equal(changes.at(-1).left, 400);
  controller.destroy();
});

test("resizes from the bottom-right handle within minimum and viewport bounds", () => {
  const { dom, root, controller, changes } = setup({
    initialLayout: { left: 200, top: 100, width: 380, height: 360, collapsed: false }
  });
  const resize = dom.window.document.querySelector("#resize");

  pointer(dom.window, resize, "pointerdown", 580, 460);
  pointer(dom.window, dom.window, "pointermove", 250, 120);
  pointer(dom.window, dom.window, "pointerup", 250, 120);
  assert.equal(root.style.width, "300px");
  assert.equal(root.style.height, "220px");

  pointer(dom.window, resize, "pointerdown", 500, 320);
  pointer(dom.window, dom.window, "pointermove", 2000, 2000);
  pointer(dom.window, dom.window, "pointerup", 2000, 2000);
  assert.equal(root.style.width, "792px");
  assert.equal(root.style.height, "592px");
  assert.equal(changes.at(-1).width, 792);
  controller.destroy();
});

test("collapses to a draggable Yang pill and restores the expanded size", () => {
  const { dom, root, controller } = setup({
    initialLayout: { left: 600, top: 300, width: 380, height: 360, collapsed: false }
  });
  controller.collapse();
  assert.equal(root.dataset.collapsed, "true");
  assert.equal(controller.getLayout().collapsed, true);

  pointer(dom.window, dom.window.document.querySelector("#handle"), "pointerdown", 620, 320);
  pointer(dom.window, dom.window, "pointermove", 500, 200);
  pointer(dom.window, dom.window, "pointerup", 500, 200);
  controller.expand();

  assert.equal(root.dataset.collapsed, "false");
  assert.equal(root.style.width, "380px");
  assert.equal(root.style.height, "360px");
  assert.equal(root.style.left, "480px");
  assert.equal(root.style.top, "180px");
  controller.destroy();
});

test("reset and viewport resize always recover a visible panel", () => {
  const { dom, root, controller } = setup({
    initialLayout: { left: 600, top: 300, width: 380, height: 360, collapsed: false }
  });
  dom.window.innerWidth = 420;
  dom.window.innerHeight = 360;
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  assert.equal(root.style.left, "32px");
  assert.equal(root.style.top, "8px");

  controller.reset();
  assert.equal(controller.getLayout().collapsed, false);
  assert.equal(root.style.left, "22px");
  assert.equal(root.style.top, "8px");
  controller.destroy();
});

test("rejects an external layout while the user is actively dragging", () => {
  const { dom, root, controller } = setup({
    initialLayout: { left: 600, top: 300, width: 380, height: 360, collapsed: false }
  });
  pointer(dom.window, dom.window.document.querySelector("#handle"), "pointerdown", 620, 320);
  assert.equal(controller.apply({ left: 10, top: 10, width: 300, height: 220, collapsed: true }), false);
  assert.equal(root.dataset.collapsed, "false");
  pointer(dom.window, dom.window, "pointerup", 620, 320);
  assert.equal(controller.apply({ left: 10, top: 10, width: 300, height: 220, collapsed: true }), true);
  assert.equal(root.dataset.collapsed, "true");
  controller.destroy();
});
