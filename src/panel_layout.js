const VIEWPORT_MARGIN = 8;
const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 520;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 220;
const COLLAPSED_WIDTH = 104;
const COLLAPSED_HEIGHT = 44;

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const viewportOf = (pageWindow) => ({
  width: Math.max(1, finite(pageWindow?.innerWidth, 1024)),
  height: Math.max(1, finite(pageWindow?.innerHeight, 768))
});

export const normalizePanelLayout = (input = {}, viewport = { width: 1024, height: 768 }) => {
  const viewportWidth = Math.max(1, finite(viewport.width, 1024));
  const viewportHeight = Math.max(1, finite(viewport.height, 768));
  const maxWidth = Math.max(MIN_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(MIN_HEIGHT, viewportHeight - VIEWPORT_MARGIN * 2);
  const width = clamp(finite(input?.width, DEFAULT_WIDTH), MIN_WIDTH, maxWidth);
  const height = clamp(finite(input?.height, DEFAULT_HEIGHT), MIN_HEIGHT, maxHeight);
  const defaultLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - 18);
  const defaultTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - 18);
  const left = clamp(finite(input?.left, defaultLeft), VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const top = clamp(finite(input?.top, defaultTop), VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
  return { left, top, width, height, collapsed: input?.collapsed === true };
};

const isInteractive = (target) => Boolean(target?.closest?.("button,input,select,textarea,a,label,[contenteditable='true']"));

export const createPanelLayoutController = ({
  pageWindow,
  root,
  dragHandle,
  resizeHandle,
  initialLayout,
  onLayoutChange = () => {}
}) => {
  let layout = normalizePanelLayout(initialLayout, viewportOf(pageWindow));
  let interaction = null;
  let destroyed = false;
  let previousUserSelect = "";

  const visibleSize = () => layout.collapsed
    ? { width: COLLAPSED_WIDTH, height: COLLAPSED_HEIGHT }
    : { width: layout.width, height: layout.height };

  const clampPosition = (left, top) => {
    const viewport = viewportOf(pageWindow);
    const size = visibleSize();
    return {
      left: clamp(left, VIEWPORT_MARGIN, viewport.width - size.width - VIEWPORT_MARGIN),
      top: clamp(top, VIEWPORT_MARGIN, viewport.height - size.height - VIEWPORT_MARGIN)
    };
  };

  const render = () => {
    const position = clampPosition(layout.left, layout.top);
    layout = { ...layout, ...position };
    root.dataset.collapsed = String(layout.collapsed);
    root.style.left = `${layout.left}px`;
    root.style.top = `${layout.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.width = layout.collapsed ? `${COLLAPSED_WIDTH}px` : `${layout.width}px`;
    root.style.height = layout.collapsed ? `${COLLAPSED_HEIGHT}px` : `${layout.height}px`;
  };

  const emit = () => onLayoutChange({ ...layout });

  const begin = (type, event) => {
    if (destroyed || event.button > 0) return;
    if (type === "drag" && isInteractive(event.target)) return;
    if (type === "resize" && layout.collapsed) return;
    event.preventDefault();
    previousUserSelect = root.ownerDocument.documentElement.style.userSelect;
    root.ownerDocument.documentElement.style.userSelect = "none";
    root.dataset.layoutInteracting = "true";
    interaction = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      left: layout.left,
      top: layout.top,
      width: layout.width,
      height: layout.height
    };
  };

  const move = (event) => {
    if (!interaction || destroyed) return;
    event.preventDefault();
    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;
    if (interaction.type === "drag") {
      const position = clampPosition(interaction.left + deltaX, interaction.top + deltaY);
      layout = { ...layout, ...position };
    } else {
      const viewport = viewportOf(pageWindow);
      layout = {
        ...layout,
        width: clamp(interaction.width + deltaX, MIN_WIDTH, viewport.width - layout.left - VIEWPORT_MARGIN),
        height: clamp(interaction.height + deltaY, MIN_HEIGHT, viewport.height - layout.top - VIEWPORT_MARGIN)
      };
    }
    render();
  };

  const end = () => {
    if (!interaction || destroyed) return;
    interaction = null;
    root.ownerDocument.documentElement.style.userSelect = previousUserSelect;
    delete root.dataset.layoutInteracting;
    emit();
  };

  const onDragStart = (event) => begin("drag", event);
  const onResizeStart = (event) => begin("resize", event);
  const onViewportResize = () => {
    if (interaction || destroyed) return;
    layout = normalizePanelLayout(layout, viewportOf(pageWindow));
    render();
    emit();
  };

  dragHandle.addEventListener("pointerdown", onDragStart);
  resizeHandle.addEventListener("pointerdown", onResizeStart);
  pageWindow.addEventListener("pointermove", move);
  pageWindow.addEventListener("pointerup", end);
  pageWindow.addEventListener("pointercancel", end);
  pageWindow.addEventListener("resize", onViewportResize);
  render();

  return {
    expand() {
      layout = normalizePanelLayout({ ...layout, collapsed: false }, viewportOf(pageWindow));
      render();
      emit();
    },
    collapse() {
      layout = { ...layout, collapsed: true };
      render();
      emit();
    },
    reset() {
      layout = normalizePanelLayout({}, viewportOf(pageWindow));
      render();
      emit();
    },
    apply(nextLayout) {
      if (interaction || destroyed) return false;
      layout = normalizePanelLayout(nextLayout, viewportOf(pageWindow));
      render();
      return true;
    },
    getLayout: () => ({ ...layout }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.ownerDocument.documentElement.style.userSelect = previousUserSelect;
      dragHandle.removeEventListener("pointerdown", onDragStart);
      resizeHandle.removeEventListener("pointerdown", onResizeStart);
      pageWindow.removeEventListener("pointermove", move);
      pageWindow.removeEventListener("pointerup", end);
      pageWindow.removeEventListener("pointercancel", end);
      pageWindow.removeEventListener("resize", onViewportResize);
    }
  };
};
