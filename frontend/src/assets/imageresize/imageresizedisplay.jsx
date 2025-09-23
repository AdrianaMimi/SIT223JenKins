import React, { useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group } from "react-konva";

const BOX_W = 414, BOX_H = 300;
const STAGE_W = 860, STAGE_H = 560;

// Toasty pastel theme
const PINK = "#ffb3c1";
const PURPLE = "#b879dc";
const PINK_SOFT = "rgba(255, 179, 193, 0.85)";
const PURPLE_SOFT = "rgb(214, 235, 254)";
const BLUE_PASTEL = "rgb(214, 235, 254)";
const BORDER_PASTEL = "#b9dcfb";

// Load <img> for Konva
function useHTMLImage(src) {
    const [img, setImg] = useState(null);
    useEffect(() => {
        if (!src) return setImg(null);
        const el = new Image();
        if (src.startsWith("http")) el.crossOrigin = "anonymous";
        el.onload = () => setImg(el);
        el.src = src;
    }, [src]);
    return img;
}

export default function KonvaModal({ open, onClose, file, imageURL, onExport }) {
    const [toast, setToast] = useState({ show: false, visible: false, message: '', success: true });
    const toastTimers = useRef([]);

    const clearToastTimers = () => { toastTimers.current.forEach(clearTimeout); toastTimers.current = []; };
    const showToast = (message, success = true) => {
        clearToastTimers();
        setToast({ show: true, visible: false, message, success });
        toastTimers.current.push(setTimeout(() => setToast(p => ({ ...p, visible: true })), 20));
        toastTimers.current.push(setTimeout(() => setToast(p => ({ ...p, visible: false })), 2600));
        toastTimers.current.push(setTimeout(() => setToast({ show: false, visible: false, message: '', success }), 3000));
    };
    useEffect(() => () => clearToastTimers(), []);

    const stageRef = useRef(null);
    const imgRef = useRef(null);
    const trRef = useRef(null);
    const overlayRef = useRef(null);
    const frameRef = useRef(null);


    const runIdRef = useRef(0);


    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);


    const [src, setSrc] = useState(null);
    useEffect(() => {
        if (!open) return;
        if (file) {
            const u = URL.createObjectURL(file);
            setSrc(u);
            return () => URL.revokeObjectURL(u);
        }
        setSrc(imageURL || "https://picsum.photos/id/237/800/600");
    }, [open, file, imageURL]);

    const img = useHTMLImage(src);

    const boxX = (STAGE_W - BOX_W) / 2;
    const boxY = (STAGE_H - BOX_H) / 2;

    // initial place + fade each time image/src changes
    useEffect(() => {
        if (!img || !imgRef.current) return;

        const id = ++runIdRef.current;
        const node = imgRef.current;

        trRef.current?.nodes([node]);
        trRef.current?.getLayer()?.batchDraw();

        node.stop?.();
        node.opacity(0);

        // COVER placement
        const s = Math.max(BOX_W / img.width, BOX_H / img.height);
        const x = (STAGE_W - BOX_W) / 2 + (BOX_W - img.width * s) / 2;
        const y = (STAGE_H - BOX_H) / 2 + (BOX_H - img.height * s) / 2;

        // reset transforms so old state doesn't leak
        node.rotation(0);
        node.scale({ x: s, y: s });
        node.position({ x, y });
        node.getLayer()?.batchDraw();

        requestAnimationFrame(() => {
            if (runIdRef.current !== id) return; // stale run
            node.to({ opacity: 1, duration: 0.25 });
        });
    }, [img, src]);

    const sizeNow = (node) => ({ w: node.width() * node.scaleX(), h: node.height() * node.scaleY() });

    const center = () => {
        const n = imgRef.current; if (!n) return;
        const { w, h } = sizeNow(n);
        const x = (STAGE_W - BOX_W) / 2 + (BOX_W - w) / 2;
        const y = (STAGE_H - BOX_H) / 2 + (BOX_H - h) / 2;
        applyWithFade({ x, y }, 0.22);
    };

    const calcCover = () => {
        if (!img) return null;
        const s = Math.max(BOX_W / img.width, BOX_H / img.height);
        const x = (STAGE_W - BOX_W) / 2 + (BOX_W - img.width * s) / 2;
        const y = (STAGE_H - BOX_H) / 2 + (BOX_H - img.height * s) / 2;
        return { x, y, s };
    };

    const calcContain = () => {
        if (!img) return null;
        const s = Math.min(BOX_W / img.width, BOX_H / img.height);
        const x = (STAGE_W - BOX_W) / 2 + (BOX_W - img.width * s) / 2;
        const y = (STAGE_H - BOX_H) / 2 + (BOX_H - img.height * s) / 2;
        return { x, y, s };
    };

    const fitCover = () => {
        const t = calcCover(); if (!t) return;
        applyWithFade(t, 0.22);
    };

    const fitContain = () => {
        const t = calcContain(); if (!t) return;
        applyWithFade(t, 0.22);
    };

    // Shift = keep aspect while resizing
    const [shiftDown, setShiftDown] = useState(false);
    useEffect(() => {
        const onKey = (e) => setShiftDown(e.shiftKey);
        window.addEventListener("keydown", onKey);
        window.addEventListener("keyup", onKey);
        return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
    }, []);

    // Wheel zoom around mouse (keeps current non-uniform distortion)
    const onWheel = (e) => {
        e.evt.preventDefault();
        const stage = stageRef.current, node = imgRef.current;
        if (!stage || !node) return;
        const pointer = stage.getPointerPosition();
        const by = 1.05;
        const sx = node.scaleX(), sy = node.scaleY();
        const old = (sx + sy) / 2;

        const mousePoint = { x: (pointer.x - node.x()) / sx, y: (pointer.y - node.y()) / sy };
        const dir = e.evt.deltaY > 0 ? -1 : 1;
        let nu = dir > 0 ? old * by : old / by;
        nu = Math.max(nu, 0.02);

        const rx = sx / old, ry = sy / old;
        node.scale({ x: nu * rx, y: nu * ry });

        node.position({
            x: pointer.x - mousePoint.x * node.scaleX(),
            y: pointer.y - mousePoint.y * node.scaleY(),
        });
        node.getLayer()?.batchDraw();
    };

    const onDblClick = () => fitCover();

    // Clean export (hide overlay + handles temporarily)
    const exportRegion = () => {
        const stage = stageRef.current;
        if (!stage) return;
        const tr = trRef.current, overlay = overlayRef.current;
        const prevOverlay = overlay?.visible?.() ?? true;
        const prevTr = tr?.visible?.() ?? true;

        overlay?.visible(false);
        tr?.visible(false);
        stage.draw();

        try {
            const uri = stage.toDataURL({
                x: boxX, y: boxY, width: BOX_W, height: BOX_H,
                mimeType: "image/webp", quality: 0.95, pixelRatio: 1,
            });
            const a = document.createElement("a");
            a.href = uri; a.download = "export_414x300.webp"; a.click();
        } catch (e) {
            console.error("Export failed:", e);
            showToast("Export failed. Try a local image instead.", false);
        } finally {
            overlay?.visible(prevOverlay);
            tr?.visible(prevTr);
            stage.draw();
        }
    };

    if (!open) return null;

    // backdrop click to close (ignore clicks inside the card)
    const onBackdropMouseDown = (e) => {
        if (e.target === e.currentTarget) onClose?.();
    };

    const resetOrientation = () => {
        const n = imgRef.current; if (!n) return;
        const sx = Math.abs(n.scaleX());
        const sy = Math.abs(n.scaleY());
        n.rotation(0);
        n.scale({ x: sx, y: sy });
        center();
        n.getLayer()?.batchDraw();
    };

    // hide -> place -> fade in (reused by buttons)
    const applyWithFade = ({ x, y, s = null }, duration = 0.25) => {
        const n = imgRef.current; if (!n) return;
        const tr = trRef.current;

        n.stop?.();

        const trWasVisible = tr?.visible?.() ?? true;
        tr?.visible(false);

        n.opacity(0);
        if (s != null) n.scale({ x: s, y: s });
        n.position({ x, y });
        n.getLayer()?.batchDraw();

        requestAnimationFrame(() => {
            n.to({
                opacity: 1,
                duration,
                onFinish: () => {
                    tr?.visible(trWasVisible);
                    tr?.getLayer()?.batchDraw();
                },
            });
        });
    };

    const exportAsFileForParent = async () => {
        if (!onExport) return exportRegion(); // fallback to download if no handler

        const stage = stageRef.current;
        if (!stage) return;

        const tr = trRef.current, overlay = overlayRef.current;
        const prevOverlay = overlay?.visible?.() ?? true;
        const prevTr = tr?.visible?.() ?? true;

        overlay?.visible(false);
        tr?.visible(false);
        stage.draw();

        try {
            const dataUrl = stage.toDataURL({
                x: boxX, y: boxY, width: BOX_W, height: BOX_H,
                mimeType: "image/webp", quality: 0.95, pixelRatio: 1,
            });

            // turn DataURL into Blob -> File
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const fileName = `crop_${BOX_W}x${BOX_H}.webp`;
            const editedFile = new File([blob], fileName, { type: "image/webp" });

            onExport?.({ file: editedFile });
        } catch (e) {
            console.error("Export-to-parent failed:", e);
            showToast("Couldn’t export to the form. Try a local image (CORS).", false);
        } finally {
            overlay?.visible(prevOverlay);
            tr?.visible(prevTr);
            stage.draw();
        }
        console.log('exportAsFileForParent clicked');
    };


    return (
        <div
            role="dialog"
            aria-modal="true"
            onMouseDown={onBackdropMouseDown}
            style={styles.backdrop}
        >
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={styles.card}
            >
                {/* Header */}
                <div style={styles.header}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={styles.ghostBtn}>Image Editor</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={fitCover} style={styles.ghostBtn}>Fit (Cover)</button>
                        <button type="button" onClick={fitContain} style={styles.ghostBtn}>Fit (Contain)</button>
                        <button type="button" onClick={resetOrientation} style={styles.ghostBtn}>
                            Reset
                        </button>
                        {/* <button type="button" onClick={center} style={styles.ghostBtn}>Center</button>
                        <button type="button" onClick={exportRegion} style={styles.solidBtn}>Export 414×300</button> */}
                        <button type="button" onClick={exportAsFileForParent} style={styles.solidBtn}>
                            Save
                        </button>
                        <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Close">×</button>
                    </div>
                </div>

                {/* Stage on a pastel gradient board */}
                <div style={styles.stageWrap}>
                    <Stage
                        ref={stageRef}
                        width={STAGE_W}
                        height={STAGE_H}
                        pixelRatio={1}
                        style={styles.stage}
                        onWheel={onWheel}
                        onDblClick={onDblClick}
                    >
                        <Layer>
                            {img && (
                                <KonvaImage
                                    key={src || 'img'}
                                    ref={imgRef}
                                    image={img}
                                    opacity={0}
                                    onTransformEnd={() => imgRef.current?.getLayer()?.batchDraw()}
                                    draggable
                                />
                            )}

                            {/* Transformer */}
                            <Transformer
                                ref={trRef}
                                rotateEnabled
                                keepRatio={shiftDown}
                                enabledAnchors={[
                                    "top-left", "top-center", "top-right",
                                    "middle-left", "middle-right",
                                    "bottom-left", "bottom-center", "bottom-right",
                                ]}
                                anchorSize={16}
                                anchorCornerRadius={8}
                                anchorFill={BLUE_PASTEL}
                                anchorStroke="#fff"
                                anchorStrokeWidth={2}
                                borderEnabled
                                borderStroke={PURPLE_SOFT}
                                borderStrokeWidth={2}
                                borderDash={[8, 6]}
                            />
                        </Layer>

                        {/* Overlay (mask + pastel frame) — hidden on export */}
                        <Layer ref={overlayRef} listening={false} perfectDrawEnabled={false}>
                            <Rect x={0} y={0} width={STAGE_W} height={STAGE_H} fill="rgba(0,0,0,0.28)" />
                            <Rect
                                x={(STAGE_W - BOX_W) / 2}
                                y={(STAGE_H - BOX_H) / 2}
                                width={BOX_W}
                                height={BOX_H}
                                fill="black"
                                globalCompositeOperation="destination-out"
                            />
                            <Group
                                ref={frameRef}
                                x={(STAGE_W - BOX_W) / 2 + BOX_W / 2}
                                y={(STAGE_H - BOX_H) / 2 + BOX_H / 2}
                                offset={{ x: BOX_W / 2, y: BOX_H / 2 }}
                            >
                                <Rect
                                    x={0} y={0} width={BOX_W} height={BOX_H}
                                    cornerRadius={16}
                                    stroke={BLUE_PASTEL} strokeWidth={3}
                                    shadowColor={PINK_SOFT} shadowOpacity={0.9} shadowBlur={18}
                                    shadowOffset={{ x: 0, y: 0 }} opacity={1}
                                />
                                <Rect
                                    x={5} y={5} width={BOX_W - 10} height={BOX_H - 10}
                                    cornerRadius={14} stroke="#fff" strokeWidth={1.5}
                                    dash={[6, 6]} opacity={0.85}
                                />
                                <Rect
                                    x={0} y={0} width={BOX_W} height={BOX_H}
                                    cornerRadius={16}
                                    stroke={BORDER_PASTEL}
                                    strokeWidth={1}
                                    opacity={0.9}
                                />
                            </Group>
                        </Layer>
                    </Stage>
                </div>

                <div style={styles.hint}>
                    Scroll to zoom · Drag to move · Drag handles to resize (⇧ keeps ratio) · Double-click to Fit (Cover)
                </div>
            </div>
        </div>
    );
}

/* ---------- styles ---------- */
const styles = {
    backdrop: {
        position: "fixed",
        justifyContent: "center",
        alignItems: "center",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        backdropFilter: "blur(2px)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
    },
    card: {
        width: "min(96vw, 1020px)",
        borderRadius: 24,
        border: "2px solid rgba(255,255,255,.6)",
        boxShadow: "0 24px 80px rgba(0,0,0,.35)",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${PURPLE}1F, ${PINK}1F)`,
        backgroundImage: `linear-gradient(135deg, rgba(184,121,220,0.18), rgba(255,179,193,0.18))`,
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: "rgba(255,255,255,0.75)",
        borderBottom: "1px solid rgba(255,255,255,.6)",
    },
    ghostBtn: {
        appearance: "none",
        border: `2px solid ${BORDER_PASTEL}`,
        background: "rgba(255,255,255,.85)",
        color: "#1d4e89",
        padding: "8px 12px",
        borderRadius: 12,
        fontWeight: 600,
        cursor: "pointer",
    },
    solidBtn: {
        appearance: "none",
        border: "2px solid rgba(255,255,255,.85)",
        background: BLUE_PASTEL,
        color: "#1d4e89",
        padding: "8px 12px",
        borderRadius: 12,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: "0 8px 20px rgba(0,0,0,.12)",
    },
    closeBtn: {
        appearance: "none",
        border: "none",
        background: "transparent",
        color: "#333",
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1,
        padding: "0 4px",
        marginLeft: 4,
        cursor: "pointer",
    },
    stageWrap: {
        margin: 16,
        borderRadius: 18,
        padding: 12,
        backgroundImage: `linear-gradient(135deg, rgba(184,121,220,0.28), rgba(255,179,193,0.28))`,
        border: `2px solid ${BORDER_PASTEL}`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.6), 0 12px 28px rgba(0,0,0,.18)",
    },
    stage: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "transparent",
        borderRadius: 12,
    },
    hint: {
        fontSize: 12,
        opacity: 0.8,
        padding: "0 16px 16px",
    },
};
