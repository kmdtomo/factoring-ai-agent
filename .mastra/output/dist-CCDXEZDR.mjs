import { k as withoutTrailingSlash, s as createProviderDefinedToolFactoryWithOutputSchema, n as createProviderDefinedToolFactory, o as generateId, q as loadApiKey, t as parseProviderOptions, H as TooManyEmbeddingValuesForCallError, v as combineHeaders, x as resolve, y as postJsonToApi, z as createJsonResponseHandler, A as createEventSourceResponseHandler, u as UnsupportedFunctionalityError, B as convertToBase64, C as createJsonErrorResponseHandler } from './index.mjs';
import { z } from 'zod/v4';
import '@mastra/core/eval';
import '@mastra/core/hooks';
import '@mastra/core/storage';
import '@mastra/core/scores/scoreTraces';
import '@mastra/core/utils';
import '@mastra/core/mastra';
import '@mastra/loggers';
import '@mastra/libsql';
import '@mastra/core/workflows';
import 'zod';
import '@mastra/core/agent';
import '@ai-sdk/anthropic';
import './tools/d3e7cb0f-0f10-458e-9e7e-44fdb3874692.mjs';
import '@mastra/core';
import 'ai';
import 'axios';
import './tools/a88c7567-db41-4ed5-a901-907bdb29384c.mjs';
import '@mastra/core/tools';
import './tools/3fbc1d09-82fd-4f61-a454-852d29243b93.mjs';
import '@ai-sdk/openai';
import './tools/c9970400-5c61-46b9-8372-bcb6b5ab8f2e.mjs';
import './tools/5ec47f0e-913f-4d85-b736-c6df6656e9db.mjs';
import './tools/288bb43e-00c3-4575-aeaa-9b89dba32722.mjs';
import './google-search.mjs';
import './tools/ea03bebd-2dd4-4be6-bbd2-5e63ae1e704e.mjs';
import './tools/a39df250-c1bd-4316-893e-652855719f37.mjs';
import './tools/e0d035e6-7bdb-4393-aad2-9916d7439236.mjs';
import '@mastra/core/runtime-context';
import './tools/b0bb2191-9ae8-4c09-969b-0d1ac08bfb49.mjs';
import '@google-cloud/vision';
import 'path';
import './tools/e0bb7f9d-a6b8-44e3-b33e-4c0d1af5c23a.mjs';
import './tools/deeaa746-9c12-4d19-a588-f79a78249f0f.mjs';
import './tools/303e8d33-72cc-46aa-9b97-35346fc97685.mjs';
import './tools/b2668a74-fa56-4e5b-968d-642b2bcd6f46.mjs';
import './tools/0ae2fb52-55b6-4399-ab6a-03eab0f3befa.mjs';
import './tools/91d57681-c7e2-430b-b61c-15ce6983b2f8.mjs';
import './tools/4f1fcead-3f25-49d5-9352-a8e95a7092de.mjs';
import './tools/d7e70e36-2f33-4499-8571-97a5a7274b78.mjs';
import 'fs';
import './tools/0dab665f-bfca-4420-a413-84054e712a4a.mjs';
import 'crypto';
import 'fs/promises';
import 'https';
import 'path/posix';
import 'http';
import 'http2';
import 'stream';
import '@mastra/core/telemetry';
import '@mastra/core/error';
import '@mastra/core/llm';
import 'util';
import 'buffer';
import '@mastra/core/ai-tracing';
import '@mastra/core/utils/zod-to-json';
import '@mastra/core/a2a';
import 'stream/web';
import '@mastra/core/memory';
import 'zod/v3';
import 'child_process';
import 'module';
import 'os';
import './tools.mjs';

var googleErrorDataSchema = z.object({
  error: z.object({
    code: z.number().nullable(),
    message: z.string(),
    status: z.string()
  })
});
var googleFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: googleErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
var googleGenerativeAIEmbeddingProviderOptions = z.object({
  /**
   * Optional. Optional reduced dimension for the output embedding.
   * If set, excessive values in the output embedding are truncated from the end.
   */
  outputDimensionality: z.number().optional(),
  /**
   * Optional. Specifies the task type for generating embeddings.
   * Supported task types:
   * - SEMANTIC_SIMILARITY: Optimized for text similarity.
   * - CLASSIFICATION: Optimized for text classification.
   * - CLUSTERING: Optimized for clustering texts based on similarity.
   * - RETRIEVAL_DOCUMENT: Optimized for document retrieval.
   * - RETRIEVAL_QUERY: Optimized for query-based retrieval.
   * - QUESTION_ANSWERING: Optimized for answering questions.
   * - FACT_VERIFICATION: Optimized for verifying factual information.
   * - CODE_RETRIEVAL_QUERY: Optimized for retrieving code blocks based on natural language queries.
   */
  taskType: z.enum([
    "SEMANTIC_SIMILARITY",
    "CLASSIFICATION",
    "CLUSTERING",
    "RETRIEVAL_DOCUMENT",
    "RETRIEVAL_QUERY",
    "QUESTION_ANSWERING",
    "FACT_VERIFICATION",
    "CODE_RETRIEVAL_QUERY"
  ]).optional()
});
var GoogleGenerativeAIEmbeddingModel = class {
  constructor(modelId, config) {
    this.specificationVersion = "v2";
    this.maxEmbeddingsPerCall = 2048;
    this.supportsParallelCalls = true;
    this.modelId = modelId;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
  }
  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions
  }) {
    const googleOptions = await parseProviderOptions({
      provider: "google",
      providerOptions,
      schema: googleGenerativeAIEmbeddingProviderOptions
    });
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values
      });
    }
    const mergedHeaders = combineHeaders(
      await resolve(this.config.headers),
      headers
    );
    if (values.length === 1) {
      const {
        responseHeaders: responseHeaders2,
        value: response2,
        rawValue: rawValue2
      } = await postJsonToApi({
        url: `${this.config.baseURL}/models/${this.modelId}:embedContent`,
        headers: mergedHeaders,
        body: {
          model: `models/${this.modelId}`,
          content: {
            parts: [{ text: values[0] }]
          },
          outputDimensionality: googleOptions == null ? void 0 : googleOptions.outputDimensionality,
          taskType: googleOptions == null ? void 0 : googleOptions.taskType
        },
        failedResponseHandler: googleFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          googleGenerativeAISingleEmbeddingResponseSchema
        ),
        abortSignal,
        fetch: this.config.fetch
      });
      return {
        embeddings: [response2.embedding.values],
        usage: void 0,
        response: { headers: responseHeaders2, body: rawValue2 }
      };
    }
    const {
      responseHeaders,
      value: response,
      rawValue
    } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:batchEmbedContents`,
      headers: mergedHeaders,
      body: {
        requests: values.map((value) => ({
          model: `models/${this.modelId}`,
          content: { role: "user", parts: [{ text: value }] },
          outputDimensionality: googleOptions == null ? void 0 : googleOptions.outputDimensionality,
          taskType: googleOptions == null ? void 0 : googleOptions.taskType
        }))
      },
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleGenerativeAITextEmbeddingResponseSchema
      ),
      abortSignal,
      fetch: this.config.fetch
    });
    return {
      embeddings: response.embeddings.map((item) => item.values),
      usage: void 0,
      response: { headers: responseHeaders, body: rawValue }
    };
  }
};
var googleGenerativeAITextEmbeddingResponseSchema = z.object({
  embeddings: z.array(z.object({ values: z.array(z.number()) }))
});
var googleGenerativeAISingleEmbeddingResponseSchema = z.object({
  embedding: z.object({ values: z.array(z.number()) })
});
function convertJSONSchemaToOpenAPISchema(jsonSchema) {
  if (jsonSchema == null || isEmptyObjectSchema(jsonSchema)) {
    return void 0;
  }
  if (typeof jsonSchema === "boolean") {
    return { type: "boolean", properties: {} };
  }
  const {
    type,
    description,
    required,
    properties,
    items,
    allOf,
    anyOf,
    oneOf,
    format,
    const: constValue,
    minLength,
    enum: enumValues
  } = jsonSchema;
  const result = {};
  if (description)
    result.description = description;
  if (required)
    result.required = required;
  if (format)
    result.format = format;
  if (constValue !== void 0) {
    result.enum = [constValue];
  }
  if (type) {
    if (Array.isArray(type)) {
      if (type.includes("null")) {
        result.type = type.filter((t) => t !== "null")[0];
        result.nullable = true;
      } else {
        result.type = type;
      }
    } else if (type === "null") {
      result.type = "null";
    } else {
      result.type = type;
    }
  }
  if (enumValues !== void 0) {
    result.enum = enumValues;
  }
  if (properties != null) {
    result.properties = Object.entries(properties).reduce(
      (acc, [key, value]) => {
        acc[key] = convertJSONSchemaToOpenAPISchema(value);
        return acc;
      },
      {}
    );
  }
  if (items) {
    result.items = Array.isArray(items) ? items.map(convertJSONSchemaToOpenAPISchema) : convertJSONSchemaToOpenAPISchema(items);
  }
  if (allOf) {
    result.allOf = allOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (anyOf) {
    if (anyOf.some(
      (schema) => typeof schema === "object" && (schema == null ? void 0 : schema.type) === "null"
    )) {
      const nonNullSchemas = anyOf.filter(
        (schema) => !(typeof schema === "object" && (schema == null ? void 0 : schema.type) === "null")
      );
      if (nonNullSchemas.length === 1) {
        const converted = convertJSONSchemaToOpenAPISchema(nonNullSchemas[0]);
        if (typeof converted === "object") {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        result.anyOf = nonNullSchemas.map(convertJSONSchemaToOpenAPISchema);
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map(convertJSONSchemaToOpenAPISchema);
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (minLength !== void 0) {
    result.minLength = minLength;
  }
  return result;
}
function isEmptyObjectSchema(jsonSchema) {
  return jsonSchema != null && typeof jsonSchema === "object" && jsonSchema.type === "object" && (jsonSchema.properties == null || Object.keys(jsonSchema.properties).length === 0) && !jsonSchema.additionalProperties;
}
function convertToGoogleGenerativeAIMessages(prompt, options) {
  var _a;
  const systemInstructionParts = [];
  const contents = [];
  let systemMessagesAllowed = true;
  const isGemmaModel = (_a = options == null ? void 0 : options.isGemmaModel) != null ? _a : false;
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        if (!systemMessagesAllowed) {
          throw new UnsupportedFunctionalityError({
            functionality: "system messages are only supported at the beginning of the conversation"
          });
        }
        systemInstructionParts.push({ text: content });
        break;
      }
      case "user": {
        systemMessagesAllowed = false;
        const parts = [];
        for (const part of content) {
          switch (part.type) {
            case "text": {
              parts.push({ text: part.text });
              break;
            }
            case "file": {
              const mediaType = part.mediaType === "image/*" ? "image/jpeg" : part.mediaType;
              parts.push(
                part.data instanceof URL ? {
                  fileData: {
                    mimeType: mediaType,
                    fileUri: part.data.toString()
                  }
                } : {
                  inlineData: {
                    mimeType: mediaType,
                    data: convertToBase64(part.data)
                  }
                }
              );
              break;
            }
          }
        }
        contents.push({ role: "user", parts });
        break;
      }
      case "assistant": {
        systemMessagesAllowed = false;
        contents.push({
          role: "model",
          parts: content.map((part) => {
            var _a2, _b, _c, _d, _e, _f;
            switch (part.type) {
              case "text": {
                return part.text.length === 0 ? void 0 : {
                  text: part.text,
                  thoughtSignature: (_b = (_a2 = part.providerOptions) == null ? void 0 : _a2.google) == null ? void 0 : _b.thoughtSignature
                };
              }
              case "reasoning": {
                return part.text.length === 0 ? void 0 : {
                  text: part.text,
                  thought: true,
                  thoughtSignature: (_d = (_c = part.providerOptions) == null ? void 0 : _c.google) == null ? void 0 : _d.thoughtSignature
                };
              }
              case "file": {
                if (part.mediaType !== "image/png") {
                  throw new UnsupportedFunctionalityError({
                    functionality: "Only PNG images are supported in assistant messages"
                  });
                }
                if (part.data instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    functionality: "File data URLs in assistant messages are not supported"
                  });
                }
                return {
                  inlineData: {
                    mimeType: part.mediaType,
                    data: convertToBase64(part.data)
                  }
                };
              }
              case "tool-call": {
                return {
                  functionCall: {
                    name: part.toolName,
                    args: part.input
                  },
                  thoughtSignature: (_f = (_e = part.providerOptions) == null ? void 0 : _e.google) == null ? void 0 : _f.thoughtSignature
                };
              }
            }
          }).filter((part) => part !== void 0)
        });
        break;
      }
      case "tool": {
        systemMessagesAllowed = false;
        contents.push({
          role: "user",
          parts: content.map((part) => ({
            functionResponse: {
              name: part.toolName,
              response: {
                name: part.toolName,
                content: part.output.value
              }
            }
          }))
        });
        break;
      }
    }
  }
  if (isGemmaModel && systemInstructionParts.length > 0 && contents.length > 0 && contents[0].role === "user") {
    const systemText = systemInstructionParts.map((part) => part.text).join("\n\n");
    contents[0].parts.unshift({ text: systemText + "\n\n" });
  }
  return {
    systemInstruction: systemInstructionParts.length > 0 && !isGemmaModel ? { parts: systemInstructionParts } : void 0,
    contents
  };
}
function getModelPath(modelId) {
  return modelId.includes("/") ? modelId : `models/${modelId}`;
}
var googleGenerativeAIProviderOptions = z.object({
  responseModalities: z.array(z.enum(["TEXT", "IMAGE"])).optional(),
  thinkingConfig: z.object({
    thinkingBudget: z.number().optional(),
    includeThoughts: z.boolean().optional()
  }).optional(),
  /**
  Optional.
  The name of the cached content used as context to serve the prediction.
  Format: cachedContents/{cachedContent}
     */
  cachedContent: z.string().optional(),
  /**
   * Optional. Enable structured output. Default is true.
   *
   * This is useful when the JSON Schema contains elements that are
   * not supported by the OpenAPI schema version that
   * Google Generative AI uses. You can use this to disable
   * structured outputs if you need to.
   */
  structuredOutputs: z.boolean().optional(),
  /**
  Optional. A list of unique safety settings for blocking unsafe content.
   */
  safetySettings: z.array(
    z.object({
      category: z.enum([
        "HARM_CATEGORY_UNSPECIFIED",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_CIVIC_INTEGRITY"
      ]),
      threshold: z.enum([
        "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
        "BLOCK_LOW_AND_ABOVE",
        "BLOCK_MEDIUM_AND_ABOVE",
        "BLOCK_ONLY_HIGH",
        "BLOCK_NONE",
        "OFF"
      ])
    })
  ).optional(),
  threshold: z.enum([
    "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
    "BLOCK_LOW_AND_ABOVE",
    "BLOCK_MEDIUM_AND_ABOVE",
    "BLOCK_ONLY_HIGH",
    "BLOCK_NONE",
    "OFF"
  ]).optional(),
  /**
   * Optional. Enables timestamp understanding for audio-only files.
   *
   * https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/audio-understanding
   */
  audioTimestamp: z.boolean().optional(),
  /**
   * Optional. Defines labels used in billing reports. Available on Vertex AI only.
   *
   * https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/add-labels-to-api-calls
   */
  labels: z.record(z.string(), z.string()).optional()
});
function prepareTools({
  tools,
  toolChoice,
  modelId
}) {
  var _a;
  tools = (tools == null ? void 0 : tools.length) ? tools : void 0;
  const toolWarnings = [];
  const isGemini2 = modelId.includes("gemini-2");
  const supportsDynamicRetrieval = modelId.includes("gemini-1.5-flash") && !modelId.includes("-8b");
  if (tools == null) {
    return { tools: void 0, toolConfig: void 0, toolWarnings };
  }
  const hasFunctionTools = tools.some((tool) => tool.type === "function");
  const hasProviderDefinedTools = tools.some(
    (tool) => tool.type === "provider-defined"
  );
  if (hasFunctionTools && hasProviderDefinedTools) {
    toolWarnings.push({
      type: "unsupported-tool",
      tool: tools.find((tool) => tool.type === "function"),
      details: "Cannot mix function tools with provider-defined tools in the same request. Please use either function tools or provider-defined tools, but not both."
    });
  }
  if (hasProviderDefinedTools) {
    const googleTools2 = {};
    const providerDefinedTools = tools.filter(
      (tool) => tool.type === "provider-defined"
    );
    providerDefinedTools.forEach((tool) => {
      switch (tool.id) {
        case "google.google_search":
          if (isGemini2) {
            googleTools2.googleSearch = {};
          } else if (supportsDynamicRetrieval) {
            googleTools2.googleSearchRetrieval = {
              dynamicRetrievalConfig: {
                mode: tool.args.mode,
                dynamicThreshold: tool.args.dynamicThreshold
              }
            };
          } else {
            googleTools2.googleSearchRetrieval = {};
          }
          break;
        case "google.url_context":
          if (isGemini2) {
            googleTools2.urlContext = {};
          } else {
            toolWarnings.push({
              type: "unsupported-tool",
              tool,
              details: "The URL context tool is not supported with other Gemini models than Gemini 2."
            });
          }
          break;
        case "google.code_execution":
          if (isGemini2) {
            googleTools2.codeExecution = {};
          } else {
            toolWarnings.push({
              type: "unsupported-tool",
              tool,
              details: "The code execution tools is not supported with other Gemini models than Gemini 2."
            });
          }
          break;
        default:
          toolWarnings.push({ type: "unsupported-tool", tool });
          break;
      }
    });
    return {
      tools: Object.keys(googleTools2).length > 0 ? googleTools2 : void 0,
      toolConfig: void 0,
      toolWarnings
    };
  }
  const functionDeclarations = [];
  for (const tool of tools) {
    switch (tool.type) {
      case "function":
        functionDeclarations.push({
          name: tool.name,
          description: (_a = tool.description) != null ? _a : "",
          parameters: convertJSONSchemaToOpenAPISchema(tool.inputSchema)
        });
        break;
      default:
        toolWarnings.push({ type: "unsupported-tool", tool });
        break;
    }
  }
  if (toolChoice == null) {
    return {
      tools: { functionDeclarations },
      toolConfig: void 0,
      toolWarnings
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        toolWarnings
      };
    case "none":
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: "NONE" } },
        toolWarnings
      };
    case "required":
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
        toolWarnings
      };
    case "tool":
      return {
        tools: { functionDeclarations },
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: [toolChoice.toolName]
          }
        },
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
function mapGoogleGenerativeAIFinishReason({
  finishReason,
  hasToolCalls
}) {
  switch (finishReason) {
    case "STOP":
      return hasToolCalls ? "tool-calls" : "stop";
    case "MAX_TOKENS":
      return "length";
    case "IMAGE_SAFETY":
    case "RECITATION":
    case "SAFETY":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return "content-filter";
    case "FINISH_REASON_UNSPECIFIED":
    case "OTHER":
      return "other";
    case "MALFORMED_FUNCTION_CALL":
      return "error";
    default:
      return "unknown";
  }
}
var groundingChunkSchema = z.object({
  web: z.object({ uri: z.string(), title: z.string() }).nullish(),
  retrievedContext: z.object({ uri: z.string(), title: z.string() }).nullish()
});
var groundingMetadataSchema = z.object({
  webSearchQueries: z.array(z.string()).nullish(),
  retrievalQueries: z.array(z.string()).nullish(),
  searchEntryPoint: z.object({ renderedContent: z.string() }).nullish(),
  groundingChunks: z.array(groundingChunkSchema).nullish(),
  groundingSupports: z.array(
    z.object({
      segment: z.object({
        startIndex: z.number().nullish(),
        endIndex: z.number().nullish(),
        text: z.string().nullish()
      }),
      segment_text: z.string().nullish(),
      groundingChunkIndices: z.array(z.number()).nullish(),
      supportChunkIndices: z.array(z.number()).nullish(),
      confidenceScores: z.array(z.number()).nullish(),
      confidenceScore: z.array(z.number()).nullish()
    })
  ).nullish(),
  retrievalMetadata: z.union([
    z.object({
      webDynamicRetrievalScore: z.number()
    }),
    z.object({})
  ]).nullish()
});
var googleSearch = createProviderDefinedToolFactory({
  id: "google.google_search",
  name: "google_search",
  inputSchema: z.object({
    mode: z.enum(["MODE_DYNAMIC", "MODE_UNSPECIFIED"]).default("MODE_UNSPECIFIED"),
    dynamicThreshold: z.number().default(1)
  })
});
var urlMetadataSchema = z.object({
  retrievedUrl: z.string(),
  urlRetrievalStatus: z.string()
});
var urlContextMetadataSchema = z.object({
  urlMetadata: z.array(urlMetadataSchema)
});
var urlContext = createProviderDefinedToolFactory({
  id: "google.url_context",
  name: "url_context",
  inputSchema: z.object({})
});
var GoogleGenerativeAILanguageModel = class {
  constructor(modelId, config) {
    this.specificationVersion = "v2";
    var _a;
    this.modelId = modelId;
    this.config = config;
    this.generateId = (_a = config.generateId) != null ? _a : generateId;
  }
  get provider() {
    return this.config.provider;
  }
  get supportedUrls() {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.config).supportedUrls) == null ? void 0 : _b.call(_a)) != null ? _c : {};
  }
  async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    tools,
    toolChoice,
    providerOptions
  }) {
    var _a, _b;
    const warnings = [];
    const googleOptions = await parseProviderOptions({
      provider: "google",
      providerOptions,
      schema: googleGenerativeAIProviderOptions
    });
    if (((_a = googleOptions == null ? void 0 : googleOptions.thinkingConfig) == null ? void 0 : _a.includeThoughts) === true && !this.config.provider.startsWith("google.vertex.")) {
      warnings.push({
        type: "other",
        message: `The 'includeThoughts' option is only supported with the Google Vertex provider and might not be supported or could behave unexpectedly with the current Google provider (${this.config.provider}).`
      });
    }
    const isGemmaModel = this.modelId.toLowerCase().startsWith("gemma-");
    const { contents, systemInstruction } = convertToGoogleGenerativeAIMessages(
      prompt,
      { isGemmaModel }
    );
    const {
      tools: googleTools2,
      toolConfig: googleToolConfig,
      toolWarnings
    } = prepareTools({
      tools,
      toolChoice,
      modelId: this.modelId
    });
    return {
      args: {
        generationConfig: {
          // standardized settings:
          maxOutputTokens,
          temperature,
          topK,
          topP,
          frequencyPenalty,
          presencePenalty,
          stopSequences,
          seed,
          // response format:
          responseMimeType: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? "application/json" : void 0,
          responseSchema: (responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && // Google GenAI does not support all OpenAPI Schema features,
          // so this is needed as an escape hatch:
          // TODO convert into provider option
          ((_b = googleOptions == null ? void 0 : googleOptions.structuredOutputs) != null ? _b : true) ? convertJSONSchemaToOpenAPISchema(responseFormat.schema) : void 0,
          ...(googleOptions == null ? void 0 : googleOptions.audioTimestamp) && {
            audioTimestamp: googleOptions.audioTimestamp
          },
          // provider options:
          responseModalities: googleOptions == null ? void 0 : googleOptions.responseModalities,
          thinkingConfig: googleOptions == null ? void 0 : googleOptions.thinkingConfig
        },
        contents,
        systemInstruction: isGemmaModel ? void 0 : systemInstruction,
        safetySettings: googleOptions == null ? void 0 : googleOptions.safetySettings,
        tools: googleTools2,
        toolConfig: googleToolConfig,
        cachedContent: googleOptions == null ? void 0 : googleOptions.cachedContent,
        labels: googleOptions == null ? void 0 : googleOptions.labels
      },
      warnings: [...warnings, ...toolWarnings]
    };
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    const { args, warnings } = await this.getArgs(options);
    const body = JSON.stringify(args);
    const mergedHeaders = combineHeaders(
      await resolve(this.config.headers),
      options.headers
    );
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi({
      url: `${this.config.baseURL}/${getModelPath(
        this.modelId
      )}:generateContent`,
      headers: mergedHeaders,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const candidate = response.candidates[0];
    const content = [];
    const parts = (_b = (_a = candidate.content) == null ? void 0 : _a.parts) != null ? _b : [];
    const usageMetadata = response.usageMetadata;
    let lastCodeExecutionToolCallId;
    for (const part of parts) {
      if ("executableCode" in part && ((_c = part.executableCode) == null ? void 0 : _c.code)) {
        const toolCallId = this.config.generateId();
        lastCodeExecutionToolCallId = toolCallId;
        content.push({
          type: "tool-call",
          toolCallId,
          toolName: "code_execution",
          input: JSON.stringify(part.executableCode),
          providerExecuted: true
        });
      } else if ("codeExecutionResult" in part && part.codeExecutionResult) {
        content.push({
          type: "tool-result",
          // Assumes a result directly follows its corresponding call part.
          toolCallId: lastCodeExecutionToolCallId,
          toolName: "code_execution",
          result: {
            outcome: part.codeExecutionResult.outcome,
            output: part.codeExecutionResult.output
          },
          providerExecuted: true
        });
        lastCodeExecutionToolCallId = void 0;
      } else if ("text" in part && part.text != null && part.text.length > 0) {
        content.push({
          type: part.thought === true ? "reasoning" : "text",
          text: part.text,
          providerMetadata: part.thoughtSignature ? { google: { thoughtSignature: part.thoughtSignature } } : void 0
        });
      } else if ("functionCall" in part) {
        content.push({
          type: "tool-call",
          toolCallId: this.config.generateId(),
          toolName: part.functionCall.name,
          input: JSON.stringify(part.functionCall.args),
          providerMetadata: part.thoughtSignature ? { google: { thoughtSignature: part.thoughtSignature } } : void 0
        });
      } else if ("inlineData" in part) {
        content.push({
          type: "file",
          data: part.inlineData.data,
          mediaType: part.inlineData.mimeType
        });
      }
    }
    const sources = (_d = extractSources({
      groundingMetadata: candidate.groundingMetadata,
      generateId: this.config.generateId
    })) != null ? _d : [];
    for (const source of sources) {
      content.push(source);
    }
    return {
      content,
      finishReason: mapGoogleGenerativeAIFinishReason({
        finishReason: candidate.finishReason,
        hasToolCalls: content.some((part) => part.type === "tool-call")
      }),
      usage: {
        inputTokens: (_e = usageMetadata == null ? void 0 : usageMetadata.promptTokenCount) != null ? _e : void 0,
        outputTokens: (_f = usageMetadata == null ? void 0 : usageMetadata.candidatesTokenCount) != null ? _f : void 0,
        totalTokens: (_g = usageMetadata == null ? void 0 : usageMetadata.totalTokenCount) != null ? _g : void 0,
        reasoningTokens: (_h = usageMetadata == null ? void 0 : usageMetadata.thoughtsTokenCount) != null ? _h : void 0,
        cachedInputTokens: (_i = usageMetadata == null ? void 0 : usageMetadata.cachedContentTokenCount) != null ? _i : void 0
      },
      warnings,
      providerMetadata: {
        google: {
          groundingMetadata: (_j = candidate.groundingMetadata) != null ? _j : null,
          urlContextMetadata: (_k = candidate.urlContextMetadata) != null ? _k : null,
          safetyRatings: (_l = candidate.safetyRatings) != null ? _l : null,
          usageMetadata: usageMetadata != null ? usageMetadata : null
        }
      },
      request: { body },
      response: {
        // TODO timestamp, model id, id
        headers: responseHeaders,
        body: rawResponse
      }
    };
  }
  async doStream(options) {
    const { args, warnings } = await this.getArgs(options);
    const body = JSON.stringify(args);
    const headers = combineHeaders(
      await resolve(this.config.headers),
      options.headers
    );
    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/${getModelPath(
        this.modelId
      )}:streamGenerateContent?alt=sse`,
      headers,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(chunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    let finishReason = "unknown";
    const usage = {
      inputTokens: void 0,
      outputTokens: void 0,
      totalTokens: void 0
    };
    let providerMetadata = void 0;
    const generateId3 = this.config.generateId;
    let hasToolCalls = false;
    let currentTextBlockId = null;
    let currentReasoningBlockId = null;
    let blockCounter = 0;
    const emittedSourceUrls = /* @__PURE__ */ new Set();
    let lastCodeExecutionToolCallId;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings });
          },
          transform(chunk, controller) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
            if (options.includeRawChunks) {
              controller.enqueue({ type: "raw", rawValue: chunk.rawValue });
            }
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            const usageMetadata = value.usageMetadata;
            if (usageMetadata != null) {
              usage.inputTokens = (_a = usageMetadata.promptTokenCount) != null ? _a : void 0;
              usage.outputTokens = (_b = usageMetadata.candidatesTokenCount) != null ? _b : void 0;
              usage.totalTokens = (_c = usageMetadata.totalTokenCount) != null ? _c : void 0;
              usage.reasoningTokens = (_d = usageMetadata.thoughtsTokenCount) != null ? _d : void 0;
              usage.cachedInputTokens = (_e = usageMetadata.cachedContentTokenCount) != null ? _e : void 0;
            }
            const candidate = (_f = value.candidates) == null ? void 0 : _f[0];
            if (candidate == null) {
              return;
            }
            const content = candidate.content;
            const sources = extractSources({
              groundingMetadata: candidate.groundingMetadata,
              generateId: generateId3
            });
            if (sources != null) {
              for (const source of sources) {
                if (source.sourceType === "url" && !emittedSourceUrls.has(source.url)) {
                  emittedSourceUrls.add(source.url);
                  controller.enqueue(source);
                }
              }
            }
            if (content != null) {
              const parts = (_g = content.parts) != null ? _g : [];
              for (const part of parts) {
                if ("executableCode" in part && ((_h = part.executableCode) == null ? void 0 : _h.code)) {
                  const toolCallId = generateId3();
                  lastCodeExecutionToolCallId = toolCallId;
                  controller.enqueue({
                    type: "tool-call",
                    toolCallId,
                    toolName: "code_execution",
                    input: JSON.stringify(part.executableCode),
                    providerExecuted: true
                  });
                  hasToolCalls = true;
                } else if ("codeExecutionResult" in part && part.codeExecutionResult) {
                  const toolCallId = lastCodeExecutionToolCallId;
                  if (toolCallId) {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId,
                      toolName: "code_execution",
                      result: {
                        outcome: part.codeExecutionResult.outcome,
                        output: part.codeExecutionResult.output
                      },
                      providerExecuted: true
                    });
                    lastCodeExecutionToolCallId = void 0;
                  }
                } else if ("text" in part && part.text != null && part.text.length > 0) {
                  if (part.thought === true) {
                    if (currentTextBlockId !== null) {
                      controller.enqueue({
                        type: "text-end",
                        id: currentTextBlockId
                      });
                      currentTextBlockId = null;
                    }
                    if (currentReasoningBlockId === null) {
                      currentReasoningBlockId = String(blockCounter++);
                      controller.enqueue({
                        type: "reasoning-start",
                        id: currentReasoningBlockId,
                        providerMetadata: part.thoughtSignature ? {
                          google: {
                            thoughtSignature: part.thoughtSignature
                          }
                        } : void 0
                      });
                    }
                    controller.enqueue({
                      type: "reasoning-delta",
                      id: currentReasoningBlockId,
                      delta: part.text,
                      providerMetadata: part.thoughtSignature ? {
                        google: { thoughtSignature: part.thoughtSignature }
                      } : void 0
                    });
                  } else {
                    if (currentReasoningBlockId !== null) {
                      controller.enqueue({
                        type: "reasoning-end",
                        id: currentReasoningBlockId
                      });
                      currentReasoningBlockId = null;
                    }
                    if (currentTextBlockId === null) {
                      currentTextBlockId = String(blockCounter++);
                      controller.enqueue({
                        type: "text-start",
                        id: currentTextBlockId,
                        providerMetadata: part.thoughtSignature ? {
                          google: {
                            thoughtSignature: part.thoughtSignature
                          }
                        } : void 0
                      });
                    }
                    controller.enqueue({
                      type: "text-delta",
                      id: currentTextBlockId,
                      delta: part.text,
                      providerMetadata: part.thoughtSignature ? {
                        google: { thoughtSignature: part.thoughtSignature }
                      } : void 0
                    });
                  }
                }
              }
              const inlineDataParts = getInlineDataParts(content.parts);
              if (inlineDataParts != null) {
                for (const part of inlineDataParts) {
                  controller.enqueue({
                    type: "file",
                    mediaType: part.inlineData.mimeType,
                    data: part.inlineData.data
                  });
                }
              }
              const toolCallDeltas = getToolCallsFromParts({
                parts: content.parts,
                generateId: generateId3
              });
              if (toolCallDeltas != null) {
                for (const toolCall of toolCallDeltas) {
                  controller.enqueue({
                    type: "tool-input-start",
                    id: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    providerMetadata: toolCall.providerMetadata
                  });
                  controller.enqueue({
                    type: "tool-input-delta",
                    id: toolCall.toolCallId,
                    delta: toolCall.args,
                    providerMetadata: toolCall.providerMetadata
                  });
                  controller.enqueue({
                    type: "tool-input-end",
                    id: toolCall.toolCallId,
                    providerMetadata: toolCall.providerMetadata
                  });
                  controller.enqueue({
                    type: "tool-call",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    input: toolCall.args,
                    providerMetadata: toolCall.providerMetadata
                  });
                  hasToolCalls = true;
                }
              }
            }
            if (candidate.finishReason != null) {
              finishReason = mapGoogleGenerativeAIFinishReason({
                finishReason: candidate.finishReason,
                hasToolCalls
              });
              providerMetadata = {
                google: {
                  groundingMetadata: (_i = candidate.groundingMetadata) != null ? _i : null,
                  urlContextMetadata: (_j = candidate.urlContextMetadata) != null ? _j : null,
                  safetyRatings: (_k = candidate.safetyRatings) != null ? _k : null
                }
              };
              if (usageMetadata != null) {
                providerMetadata.google.usageMetadata = usageMetadata;
              }
            }
          },
          flush(controller) {
            if (currentTextBlockId !== null) {
              controller.enqueue({
                type: "text-end",
                id: currentTextBlockId
              });
            }
            if (currentReasoningBlockId !== null) {
              controller.enqueue({
                type: "reasoning-end",
                id: currentReasoningBlockId
              });
            }
            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
              providerMetadata
            });
          }
        })
      ),
      response: { headers: responseHeaders },
      request: { body }
    };
  }
};
function getToolCallsFromParts({
  parts,
  generateId: generateId3
}) {
  const functionCallParts = parts == null ? void 0 : parts.filter(
    (part) => "functionCall" in part
  );
  return functionCallParts == null || functionCallParts.length === 0 ? void 0 : functionCallParts.map((part) => ({
    type: "tool-call",
    toolCallId: generateId3(),
    toolName: part.functionCall.name,
    args: JSON.stringify(part.functionCall.args),
    providerMetadata: part.thoughtSignature ? { google: { thoughtSignature: part.thoughtSignature } } : void 0
  }));
}
function getInlineDataParts(parts) {
  return parts == null ? void 0 : parts.filter(
    (part) => "inlineData" in part
  );
}
function extractSources({
  groundingMetadata,
  generateId: generateId3
}) {
  var _a;
  return (_a = groundingMetadata == null ? void 0 : groundingMetadata.groundingChunks) == null ? void 0 : _a.filter(
    (chunk) => chunk.web != null
  ).map((chunk) => ({
    type: "source",
    sourceType: "url",
    id: generateId3(),
    url: chunk.web.uri,
    title: chunk.web.title
  }));
}
var contentSchema = z.object({
  parts: z.array(
    z.union([
      // note: order matters since text can be fully empty
      z.object({
        functionCall: z.object({
          name: z.string(),
          args: z.unknown()
        }),
        thoughtSignature: z.string().nullish()
      }),
      z.object({
        inlineData: z.object({
          mimeType: z.string(),
          data: z.string()
        })
      }),
      z.object({
        executableCode: z.object({
          language: z.string(),
          code: z.string()
        }).nullish(),
        codeExecutionResult: z.object({
          outcome: z.string(),
          output: z.string()
        }).nullish(),
        text: z.string().nullish(),
        thought: z.boolean().nullish(),
        thoughtSignature: z.string().nullish()
      })
    ])
  ).nullish()
});
var safetyRatingSchema = z.object({
  category: z.string().nullish(),
  probability: z.string().nullish(),
  probabilityScore: z.number().nullish(),
  severity: z.string().nullish(),
  severityScore: z.number().nullish(),
  blocked: z.boolean().nullish()
});
var usageSchema = z.object({
  cachedContentTokenCount: z.number().nullish(),
  thoughtsTokenCount: z.number().nullish(),
  promptTokenCount: z.number().nullish(),
  candidatesTokenCount: z.number().nullish(),
  totalTokenCount: z.number().nullish()
});
var responseSchema = z.object({
  candidates: z.array(
    z.object({
      content: contentSchema.nullish().or(z.object({}).strict()),
      finishReason: z.string().nullish(),
      safetyRatings: z.array(safetyRatingSchema).nullish(),
      groundingMetadata: groundingMetadataSchema.nullish(),
      urlContextMetadata: urlContextMetadataSchema.nullish()
    })
  ),
  usageMetadata: usageSchema.nullish()
});
var chunkSchema = z.object({
  candidates: z.array(
    z.object({
      content: contentSchema.nullish(),
      finishReason: z.string().nullish(),
      safetyRatings: z.array(safetyRatingSchema).nullish(),
      groundingMetadata: groundingMetadataSchema.nullish(),
      urlContextMetadata: urlContextMetadataSchema.nullish()
    })
  ).nullish(),
  usageMetadata: usageSchema.nullish()
});
var codeExecution = createProviderDefinedToolFactoryWithOutputSchema({
  id: "google.code_execution",
  name: "code_execution",
  inputSchema: z.object({
    language: z.string().describe("The programming language of the code."),
    code: z.string().describe("The code to be executed.")
  }),
  outputSchema: z.object({
    outcome: z.string().describe('The outcome of the execution (e.g., "OUTCOME_OK").'),
    output: z.string().describe("The output from the code execution.")
  })
});
var googleTools = {
  /**
   * Creates a Google search tool that gives Google direct access to real-time web content.
   * Must have name "google_search".
   */
  googleSearch,
  /**
   * Creates a URL context tool that gives Google direct access to real-time web content.
   * Must have name "url_context".
   */
  urlContext,
  /**
   * A tool that enables the model to generate and run Python code.
   * Must have name "code_execution".
   *
   * @note Ensure the selected model supports Code Execution.
   * Multi-tool usage with the code execution tool is typically compatible with Gemini >=2 models.
   *
   * @see https://ai.google.dev/gemini-api/docs/code-execution (Google AI)
   * @see https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/code-execution-api (Vertex AI)
   */
  codeExecution
};
var GoogleGenerativeAIImageModel = class {
  constructor(modelId, settings, config) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.specificationVersion = "v2";
  }
  get maxImagesPerCall() {
    var _a;
    return (_a = this.settings.maxImagesPerCall) != null ? _a : 4;
  }
  get provider() {
    return this.config.provider;
  }
  async doGenerate(options) {
    var _a, _b, _c;
    const {
      prompt,
      n = 1,
      size = "1024x1024",
      aspectRatio = "1:1",
      seed,
      providerOptions,
      headers,
      abortSignal
    } = options;
    const warnings = [];
    if (size != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "size",
        details: "This model does not support the `size` option. Use `aspectRatio` instead."
      });
    }
    if (seed != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "seed",
        details: "This model does not support the `seed` option through this provider."
      });
    }
    const googleOptions = await parseProviderOptions({
      provider: "google",
      providerOptions,
      schema: googleImageProviderOptionsSchema
    });
    const currentDate = (_c = (_b = (_a = this.config._internal) == null ? void 0 : _a.currentDate) == null ? void 0 : _b.call(_a)) != null ? _c : /* @__PURE__ */ new Date();
    const parameters = {
      sampleCount: n
    };
    if (aspectRatio != null) {
      parameters.aspectRatio = aspectRatio;
    }
    if (googleOptions) {
      Object.assign(parameters, googleOptions);
    }
    const body = {
      instances: [{ prompt }],
      parameters
    };
    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:predict`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleImageResponseSchema
      ),
      abortSignal,
      fetch: this.config.fetch
    });
    return {
      images: response.predictions.map(
        (p) => p.bytesBase64Encoded
      ),
      warnings: warnings != null ? warnings : [],
      providerMetadata: {
        google: {
          images: response.predictions.map((prediction) => ({
            // Add any prediction-specific metadata here
          }))
        }
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders
      }
    };
  }
};
var googleImageResponseSchema = z.object({
  predictions: z.array(z.object({ bytesBase64Encoded: z.string() })).default([])
});
var googleImageProviderOptionsSchema = z.object({
  personGeneration: z.enum(["dont_allow", "allow_adult", "allow_all"]).nullish(),
  aspectRatio: z.enum(["1:1", "3:4", "4:3", "9:16", "16:9"]).nullish()
});
function createGoogleGenerativeAI(options = {}) {
  var _a;
  const baseURL = (_a = withoutTrailingSlash(options.baseURL)) != null ? _a : "https://generativelanguage.googleapis.com/v1beta";
  const getHeaders = () => ({
    "x-goog-api-key": loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "GOOGLE_GENERATIVE_AI_API_KEY",
      description: "Google Generative AI"
    }),
    ...options.headers
  });
  const createChatModel = (modelId) => {
    var _a2;
    return new GoogleGenerativeAILanguageModel(modelId, {
      provider: "google.generative-ai",
      baseURL,
      headers: getHeaders,
      generateId: (_a2 = options.generateId) != null ? _a2 : generateId,
      supportedUrls: () => ({
        "*": [
          // Google Generative Language "files" endpoint
          // e.g. https://generativelanguage.googleapis.com/v1beta/files/...
          new RegExp(`^${baseURL}/files/.*$`),
          // YouTube URLs (public or unlisted videos)
          new RegExp(
            `^https://(?:www\\.)?youtube\\.com/watch\\?v=[\\w-]+(?:&[\\w=&.-]*)?$`
          ),
          new RegExp(`^https://youtu\\.be/[\\w-]+(?:\\?[\\w=&.-]*)?$`)
        ]
      }),
      fetch: options.fetch
    });
  };
  const createEmbeddingModel = (modelId) => new GoogleGenerativeAIEmbeddingModel(modelId, {
    provider: "google.generative-ai",
    baseURL,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createImageModel = (modelId, settings = {}) => new GoogleGenerativeAIImageModel(modelId, settings, {
    provider: "google.generative-ai",
    baseURL,
    headers: getHeaders,
    fetch: options.fetch
  });
  const provider = function(modelId) {
    if (new.target) {
      throw new Error(
        "The Google Generative AI model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId);
  };
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.generativeAI = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.tools = googleTools;
  return provider;
}
var google = createGoogleGenerativeAI();

export { createGoogleGenerativeAI, google };
