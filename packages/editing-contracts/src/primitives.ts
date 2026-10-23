import { z } from "zod";

export const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const UUID = z.uuid();
export const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const num = z.number().finite().min(-100000).max(100000);
export const positive = z.number().finite().positive().max(100000);
export const unit = z.number().min(0).max(1);
export const Frame = z.number().int().min(0).max(216000);
export const Point = z.strictObject({ x: num, y: num });
export const Rect = z.strictObject({
  x: num,
  y: num,
  width: positive,
  height: positive,
});
export const Crop = z
  .strictObject({ x: unit, y: unit, width: unit.gt(0), height: unit.gt(0) })
  .refine(
    (r) => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001,
    "Crop exceeds source bounds",
  );
export const Color = z.string().regex(/^#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?$/);
export const Transform = z.strictObject({
  x: num,
  y: num,
  scaleX: z.number().min(0.01).max(100),
  scaleY: z.number().min(0.01).max(100),
  rotation: num,
  pivot: Point,
});
export const identity = () => ({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  pivot: { x: 0, y: 0 },
});
export const Easing = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("linear") }),
  z.strictObject({
    kind: z.literal("bezier"),
    x1: unit,
    y1: unit,
    x2: unit,
    y2: unit,
  }),
  z.strictObject({
    kind: z.literal("spring"),
    stiffness: z.number().min(1).max(500),
    damping: z.number().min(1).max(100),
    mass: z.number().min(0.1).max(10),
  }),
]);
export const Track = z.strictObject({
  property: z.enum([
    "x",
    "y",
    "scaleX",
    "scaleY",
    "rotation",
    "opacity",
    "strokeProgress",
    "clipProgress",
  ]),
  keyframes: z
    .array(z.strictObject({ frame: Frame, value: num, easing: Easing }))
    .min(1)
    .max(120),
});
export const PathCommand = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("M"), x: num, y: num }),
  z.strictObject({ op: z.literal("L"), x: num, y: num }),
  z.strictObject({ op: z.literal("Q"), x1: num, y1: num, x: num, y: num }),
  z.strictObject({
    op: z.literal("C"),
    x1: num,
    y1: num,
    x2: num,
    y2: num,
    x: num,
    y: num,
  }),
  z.strictObject({ op: z.literal("Z") }),
]);
export type PathCommandType = z.infer<typeof PathCommand>;
export type PointType = z.infer<typeof Point>;
export const Geometry = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("rect"),
    bounds: Rect,
    radius: z.number().min(0).max(1000),
  }),
  z.strictObject({ kind: z.literal("ellipse"), bounds: Rect }),
  z.strictObject({
    kind: z.literal("polygon"),
    points: z.array(Point).min(3).max(128),
  }),
]);
export const Paint = z.strictObject({
  fill: Color.nullable(),
  stroke: Color.nullable(),
  strokeWidth: z.number().min(0).max(100),
  dash: z.array(z.number().positive().max(1000)).max(12),
  gradient: z
    .strictObject({
      angle: num,
      stops: z
        .array(z.strictObject({ offset: unit, color: Color }))
        .min(2)
        .max(8),
    })
    .optional(),
  shadow: z
    .strictObject({
      color: Color,
      blur: z.number().min(0).max(30),
      x: num,
      y: num,
    })
    .optional(),
});
export const Clip = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("geometry"),
    space: z.enum(["screen", "source-image", "parent"]),
    geometry: Geometry,
  }),
  z.strictObject({
    kind: z.literal("path"),
    space: z.enum(["screen", "source-image", "parent"]),
    commands: z.array(PathCommand).min(1).max(256),
  }),
  z.strictObject({
    kind: z.literal("mask"),
    space: z.enum(["screen", "source-image", "parent"]),
    assetId: Id,
    bounds: Rect,
    mode: z.enum(["alpha", "luminance"]),
  }),
]);
export const Anchor = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("screen"), point: Point }),
  z.strictObject({
    kind: z.literal("source"),
    sceneId: Id,
    assetId: Id,
    point: z.strictObject({ x: unit, y: unit }),
    offset: Point,
  }),
  z.strictObject({
    kind: z.literal("object"),
    sceneId: Id,
    objectId: Id,
    offset: Point,
  }),
  z.strictObject({
    kind: z.literal("node"),
    nodeId: Id,
    point: z.strictObject({ x: unit, y: unit }),
    offset: Point,
  }),
]);
export const TextStyle = z.strictObject({
  fontAssetId: Id,
  fontSize: z.number().min(12).max(300),
  fontWeight: z.enum(["400", "700"]),
  color: Color,
  align: z.enum(["left", "center", "right"]),
  lineHeight: z.number().min(1).max(2),
  background: Color.optional(),
});
