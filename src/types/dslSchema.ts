import { z } from "zod";

// Base and simple types
const baseNodeSchema = z.object({ type: z.string() });
const valueKindSchema = z.enum(["IDENT", "NUMBER"]);
const identifierValueSchema = z.enum([
  "price",
  "entry_price",
  "high",
  "low",
  "close",
  "volume",
  "open",
]);
const functionNameSchema = z.enum(["ma", "rsi", "atr"]);
const binaryOperatorSchema = z.enum([">", "<", ">=", "<=", "==", "!="]);
const logicalOperatorSchema = z.enum(["AND", "OR"]);
const timingSchema = z.enum(["next_open", "close", "current_close"]);

// ValueNode (no recursion)
export const valueNodeSchema = baseNodeSchema.extend({
  type: z.literal("Value"),
  kind: valueKindSchema,
  value: z.union([identifierValueSchema, z.number()]),
});
export type ValueNode = z.infer<typeof valueNodeSchema>;

// Forward-declare recursive types used in AnyNode
interface LogicalNode extends z.infer<typeof baseNodeSchema> {
  type: "Logical";
  op: z.infer<typeof logicalOperatorSchema>;
  left: AnyNode;
  right: AnyNode;
}

interface BinaryNode extends z.infer<typeof baseNodeSchema> {
  type: "Binary";
  op: z.infer<typeof binaryOperatorSchema>;
  left: AnyNode;
  right: AnyNode;
}

interface FuncNode extends z.infer<typeof baseNodeSchema> {
  type: "Func";
  name: z.infer<typeof functionNameSchema>;
  args: (number | ValueNode)[];
}

export type AnyNode = LogicalNode | BinaryNode | FuncNode | ValueNode;

// Schemas using z.lazy for recursion
export const logicalNodeSchema: z.ZodType<LogicalNode> = baseNodeSchema.extend({
  type: z.literal("Logical"),
  op: logicalOperatorSchema,
  left: z.lazy(() => anyNodeSchema), // Use the type alias here
  right: z.lazy(() => anyNodeSchema),
});

export const binaryNodeSchema: z.ZodType<BinaryNode> = baseNodeSchema.extend({
  type: z.literal("Binary"),
  op: binaryOperatorSchema,
  left: z.lazy(() => anyNodeSchema),
  right: z.lazy(() => anyNodeSchema),
});

export const funcNodeSchema: z.ZodType<FuncNode> = baseNodeSchema.extend({
  type: z.literal("Func"),
  name: functionNameSchema,
  args: z
    .array(z.union([z.number(), valueNodeSchema]))
    .min(1)
    .max(2), // Args don't directly recurse with AnyNode in their own definition
});

export const anyNodeSchema: z.ZodType<AnyNode> = z.lazy(() =>
  // Wrap the whole union in z.lazy
  z.union([
    logicalNodeSchema,
    binaryNodeSchema,
    funcNodeSchema,
    valueNodeSchema,
  ])
);

// Strategy Schema
const strategyRuleSchema = z.object({
  ast: anyNodeSchema, // Use the type alias
  timing: timingSchema,
});

export const strategyASTSchema = z.object({
  entry: strategyRuleSchema.refine(
    (data) => data.timing === "next_open" || data.timing === "close",
    { message: "Entry timing must be 'next_open' or 'close'" }
  ),
  exit: strategyRuleSchema.refine((data) => data.timing === "current_close", {
    message: "Exit timing must be 'current_close'",
  }),
  universe: z.array(z.string().regex(/^[0-9]{4}\.T$/)).min(1),
  cash: z.number().int().optional().default(1000000),
  slippage_bp: z.number().optional().default(3),
});
export type StrategyAST = z.infer<typeof strategyASTSchema>;
