import { k as withoutTrailingSlash, m as NoSuchModelError, o as generateId, q as loadApiKey, t as parseProviderOptions, y as postJsonToApi, v as combineHeaders, z as createJsonResponseHandler, A as createEventSourceResponseHandler, C as createJsonErrorResponseHandler, B as convertToBase64, u as UnsupportedFunctionalityError } from './index.mjs';
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

z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z.string().optional(),
  /**
   * Reasoning effort for reasoning models. Defaults to `medium`.
   */
  reasoningEffort: z.string().optional()
});
var openaiCompatibleErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    // The additional information below is handled loosely to support
    // OpenAI-compatible providers that have slightly different error
    // responses:
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish()
  })
});
var defaultOpenAICompatibleErrorStructure = {
  errorSchema: openaiCompatibleErrorDataSchema,
  errorToMessage: (data) => data.error.message
};
var openaiCompatibleTokenUsageSchema = z.object({
  prompt_tokens: z.number().nullish(),
  completion_tokens: z.number().nullish(),
  total_tokens: z.number().nullish(),
  prompt_tokens_details: z.object({
    cached_tokens: z.number().nullish()
  }).nullish(),
  completion_tokens_details: z.object({
    reasoning_tokens: z.number().nullish(),
    accepted_prediction_tokens: z.number().nullish(),
    rejected_prediction_tokens: z.number().nullish()
  }).nullish()
}).nullish();
z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal("assistant").nullish(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        reasoning: z.string().nullish(),
        tool_calls: z.array(
          z.object({
            id: z.string().nullish(),
            function: z.object({
              name: z.string(),
              arguments: z.string()
            })
          })
        ).nullish()
      }),
      finish_reason: z.string().nullish()
    })
  ),
  usage: openaiCompatibleTokenUsageSchema
});
z.object({
  /**
   * Echo back the prompt in addition to the completion.
   */
  echo: z.boolean().optional(),
  /**
   * Modify the likelihood of specified tokens appearing in the completion.
   *
   * Accepts a JSON object that maps tokens (specified by their token ID in
   * the GPT tokenizer) to an associated bias value from -100 to 100.
   */
  logitBias: z.record(z.string(), z.number()).optional(),
  /**
   * The suffix that comes after a completion of inserted text.
   */
  suffix: z.string().optional(),
  /**
   * A unique identifier representing your end-user, which can help providers to
   * monitor and detect abuse.
   */
  user: z.string().optional()
});
var usageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number()
});
z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      text: z.string(),
      finish_reason: z.string()
    })
  ),
  usage: usageSchema.nullish()
});
z.object({
  /**
   * The number of dimensions the resulting output embeddings should have.
   * Only supported in text-embedding-3 and later models.
   */
  dimensions: z.number().optional(),
  /**
   * A unique identifier representing your end-user, which can help providers to
   * monitor and detect abuse.
   */
  user: z.string().optional()
});
z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number() }).nullish(),
  providerMetadata: z.record(z.string(), z.record(z.string(), z.any())).optional()
});
var OpenAICompatibleImageModel = class {
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
    this.specificationVersion = "v2";
    this.maxImagesPerCall = 10;
  }
  get provider() {
    return this.config.provider;
  }
  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal
  }) {
    var _a, _b, _c, _d, _e;
    const warnings = [];
    if (aspectRatio != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "aspectRatio",
        details: "This model does not support aspect ratio. Use `size` instead."
      });
    }
    if (seed != null) {
      warnings.push({ type: "unsupported-setting", setting: "seed" });
    }
    const currentDate = (_c = (_b = (_a = this.config._internal) == null ? void 0 : _a.currentDate) == null ? void 0 : _b.call(_a)) != null ? _c : /* @__PURE__ */ new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({
        path: "/images/generations",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        prompt,
        n,
        size,
        ...(_d = providerOptions.openai) != null ? _d : {},
        response_format: "b64_json"
      },
      failedResponseHandler: createJsonErrorResponseHandler(
        (_e = this.config.errorStructure) != null ? _e : defaultOpenAICompatibleErrorStructure
      ),
      successfulResponseHandler: createJsonResponseHandler(
        openaiCompatibleImageResponseSchema
      ),
      abortSignal,
      fetch: this.config.fetch
    });
    return {
      images: response.data.map((item) => item.b64_json),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders
      }
    };
  }
};
var openaiCompatibleImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string() }))
});
function convertToXaiChatMessages(prompt) {
  const messages = [];
  const warnings = [];
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        messages.push({ role: "system", content });
        break;
      }
      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({ role: "user", content: content[0].text });
          break;
        }
        messages.push({
          role: "user",
          content: content.map((part) => {
            switch (part.type) {
              case "text": {
                return { type: "text", text: part.text };
              }
              case "file": {
                if (part.mediaType.startsWith("image/")) {
                  const mediaType = part.mediaType === "image/*" ? "image/jpeg" : part.mediaType;
                  return {
                    type: "image_url",
                    image_url: {
                      url: part.data instanceof URL ? part.data.toString() : `data:${mediaType};base64,${convertToBase64(part.data)}`
                    }
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`
                  });
                }
              }
            }
          })
        });
        break;
      }
      case "assistant": {
        let text = "";
        const toolCalls = [];
        for (const part of content) {
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input)
                }
              });
              break;
            }
          }
        }
        messages.push({
          role: "assistant",
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : void 0
        });
        break;
      }
      case "tool": {
        for (const toolResponse of content) {
          const output = toolResponse.output;
          let contentValue;
          switch (output.type) {
            case "text":
            case "error-text":
              contentValue = output.value;
              break;
            case "content":
            case "json":
            case "error-json":
              contentValue = JSON.stringify(output.value);
              break;
          }
          messages.push({
            role: "tool",
            tool_call_id: toolResponse.toolCallId,
            content: contentValue
          });
        }
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return { messages, warnings };
}
function getResponseMetadata({
  id,
  model,
  created
}) {
  return {
    id: id != null ? id : void 0,
    modelId: model != null ? model : void 0,
    timestamp: created != null ? new Date(created * 1e3) : void 0
  };
}
function mapXaiFinishReason(finishReason) {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool-calls";
    case "content_filter":
      return "content-filter";
    default:
      return "unknown";
  }
}
var webSourceSchema = z.object({
  type: z.literal("web"),
  country: z.string().length(2).optional(),
  excludedWebsites: z.array(z.string()).max(5).optional(),
  allowedWebsites: z.array(z.string()).max(5).optional(),
  safeSearch: z.boolean().optional()
});
var xSourceSchema = z.object({
  type: z.literal("x"),
  xHandles: z.array(z.string()).optional()
});
var newsSourceSchema = z.object({
  type: z.literal("news"),
  country: z.string().length(2).optional(),
  excludedWebsites: z.array(z.string()).max(5).optional(),
  safeSearch: z.boolean().optional()
});
var rssSourceSchema = z.object({
  type: z.literal("rss"),
  links: z.array(z.string().url()).max(1)
  // currently only supports one RSS link
});
var searchSourceSchema = z.discriminatedUnion("type", [
  webSourceSchema,
  xSourceSchema,
  newsSourceSchema,
  rssSourceSchema
]);
var xaiProviderOptions = z.object({
  /**
   * reasoning effort for reasoning models
   * only supported by grok-3-mini and grok-3-mini-fast models
   */
  reasoningEffort: z.enum(["low", "high"]).optional(),
  searchParameters: z.object({
    /**
     * search mode preference
     * - "off": disables search completely
     * - "auto": model decides whether to search (default)
     * - "on": always enables search
     */
    mode: z.enum(["off", "auto", "on"]),
    /**
     * whether to return citations in the response
     * defaults to true
     */
    returnCitations: z.boolean().optional(),
    /**
     * start date for search data (ISO8601 format: YYYY-MM-DD)
     */
    fromDate: z.string().optional(),
    /**
     * end date for search data (ISO8601 format: YYYY-MM-DD)
     */
    toDate: z.string().optional(),
    /**
     * maximum number of search results to consider
     * defaults to 20
     */
    maxSearchResults: z.number().min(1).max(50).optional(),
    /**
     * data sources to search from
     * defaults to ["web", "x"] if not specified
     */
    sources: z.array(searchSourceSchema).optional()
  }).optional()
});
var xaiErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish()
  })
});
var xaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: xaiErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
function prepareTools({
  tools,
  toolChoice
}) {
  tools = (tools == null ? void 0 : tools.length) ? tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tools: void 0, toolChoice: void 0, toolWarnings };
  }
  const xaiTools = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool });
    } else {
      xaiTools.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      });
    }
  }
  if (toolChoice == null) {
    return { tools: xaiTools, toolChoice: void 0, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
      return { tools: xaiTools, toolChoice: type, toolWarnings };
    case "required":
      return { tools: xaiTools, toolChoice: "required", toolWarnings };
    case "tool":
      return {
        tools: xaiTools,
        toolChoice: {
          type: "function",
          function: { name: toolChoice.toolName }
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
var XaiChatLanguageModel = class {
  constructor(modelId, config) {
    this.specificationVersion = "v2";
    this.supportedUrls = {
      "image/*": [/^https?:\/\/.*$/]
    };
    this.modelId = modelId;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
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
    seed,
    responseFormat,
    providerOptions,
    tools,
    toolChoice
  }) {
    var _a, _b, _c;
    const warnings = [];
    const options = (_a = await parseProviderOptions({
      provider: "xai",
      providerOptions,
      schema: xaiProviderOptions
    })) != null ? _a : {};
    if (topK != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "topK"
      });
    }
    if (frequencyPenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "frequencyPenalty"
      });
    }
    if (presencePenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "presencePenalty"
      });
    }
    if (stopSequences != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "stopSequences"
      });
    }
    if (responseFormat != null && responseFormat.type === "json" && responseFormat.schema != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "responseFormat",
        details: "JSON response format schema is not supported"
      });
    }
    const { messages, warnings: messageWarnings } = convertToXaiChatMessages(prompt);
    warnings.push(...messageWarnings);
    const {
      tools: xaiTools,
      toolChoice: xaiToolChoice,
      toolWarnings
    } = prepareTools({
      tools,
      toolChoice
    });
    warnings.push(...toolWarnings);
    const baseArgs = {
      // model id
      model: this.modelId,
      // standard generation settings
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      seed,
      reasoning_effort: options.reasoningEffort,
      // response format
      response_format: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? responseFormat.schema != null ? {
        type: "json_schema",
        json_schema: {
          name: (_b = responseFormat.name) != null ? _b : "response",
          schema: responseFormat.schema,
          strict: true
        }
      } : { type: "json_object" } : void 0,
      // search parameters
      search_parameters: options.searchParameters ? {
        mode: options.searchParameters.mode,
        return_citations: options.searchParameters.returnCitations,
        from_date: options.searchParameters.fromDate,
        to_date: options.searchParameters.toDate,
        max_search_results: options.searchParameters.maxSearchResults,
        sources: (_c = options.searchParameters.sources) == null ? void 0 : _c.map((source) => ({
          type: source.type,
          ...source.type === "web" && {
            country: source.country,
            excluded_websites: source.excludedWebsites,
            allowed_websites: source.allowedWebsites,
            safe_search: source.safeSearch
          },
          ...source.type === "x" && {
            x_handles: source.xHandles
          },
          ...source.type === "news" && {
            country: source.country,
            excluded_websites: source.excludedWebsites,
            safe_search: source.safeSearch
          },
          ...source.type === "rss" && {
            links: source.links
          }
        }))
      } : void 0,
      // messages in xai format
      messages,
      // tools in xai format
      tools: xaiTools,
      tool_choice: xaiToolChoice
    };
    return {
      args: baseArgs,
      warnings
    };
  }
  async doGenerate(options) {
    var _a, _b, _c;
    const { args: body, warnings } = await this.getArgs(options);
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi({
      url: `${(_a = this.config.baseURL) != null ? _a : "https://api.x.ai/v1"}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiChatResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const choice = response.choices[0];
    const content = [];
    if (choice.message.content != null && choice.message.content.length > 0) {
      let text = choice.message.content;
      const lastMessage = body.messages[body.messages.length - 1];
      if ((lastMessage == null ? void 0 : lastMessage.role) === "assistant" && text === lastMessage.content) {
        text = "";
      }
      if (text.length > 0) {
        content.push({ type: "text", text });
      }
    }
    if (choice.message.reasoning_content != null && choice.message.reasoning_content.length > 0) {
      content.push({
        type: "reasoning",
        text: choice.message.reasoning_content
      });
    }
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: "tool-call",
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolCall.function.arguments
        });
      }
    }
    if (response.citations != null) {
      for (const url of response.citations) {
        content.push({
          type: "source",
          sourceType: "url",
          id: this.config.generateId(),
          url
        });
      }
    }
    return {
      content,
      finishReason: mapXaiFinishReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        reasoningTokens: (_c = (_b = response.usage.completion_tokens_details) == null ? void 0 : _b.reasoning_tokens) != null ? _c : void 0
      },
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse
      },
      warnings
    };
  }
  async doStream(options) {
    var _a;
    const { args, warnings } = await this.getArgs(options);
    const body = {
      ...args,
      stream: true,
      stream_options: {
        include_usage: true
      }
    };
    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${(_a = this.config.baseURL) != null ? _a : "https://api.x.ai/v1"}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(xaiChatChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    let finishReason = "unknown";
    const usage = {
      inputTokens: void 0,
      outputTokens: void 0,
      totalTokens: void 0
    };
    let isFirstChunk = true;
    const contentBlocks = {};
    const lastReasoningDeltas = {};
    const self = this;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings });
          },
          transform(chunk, controller) {
            var _a2, _b;
            if (options.includeRawChunks) {
              controller.enqueue({ type: "raw", rawValue: chunk.rawValue });
            }
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            if (isFirstChunk) {
              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value)
              });
              isFirstChunk = false;
            }
            if (value.citations != null) {
              for (const url of value.citations) {
                controller.enqueue({
                  type: "source",
                  sourceType: "url",
                  id: self.config.generateId(),
                  url
                });
              }
            }
            if (value.usage != null) {
              usage.inputTokens = value.usage.prompt_tokens;
              usage.outputTokens = value.usage.completion_tokens;
              usage.totalTokens = value.usage.total_tokens;
              usage.reasoningTokens = (_b = (_a2 = value.usage.completion_tokens_details) == null ? void 0 : _a2.reasoning_tokens) != null ? _b : void 0;
            }
            const choice = value.choices[0];
            if ((choice == null ? void 0 : choice.finish_reason) != null) {
              finishReason = mapXaiFinishReason(choice.finish_reason);
            }
            if ((choice == null ? void 0 : choice.delta) == null) {
              return;
            }
            const delta = choice.delta;
            const choiceIndex = choice.index;
            if (delta.content != null && delta.content.length > 0) {
              const textContent = delta.content;
              const lastMessage = body.messages[body.messages.length - 1];
              if ((lastMessage == null ? void 0 : lastMessage.role) === "assistant" && textContent === lastMessage.content) {
                return;
              }
              const blockId = `text-${value.id || choiceIndex}`;
              if (contentBlocks[blockId] == null) {
                contentBlocks[blockId] = { type: "text" };
                controller.enqueue({
                  type: "text-start",
                  id: blockId
                });
              }
              controller.enqueue({
                type: "text-delta",
                id: blockId,
                delta: textContent
              });
            }
            if (delta.reasoning_content != null && delta.reasoning_content.length > 0) {
              const blockId = `reasoning-${value.id || choiceIndex}`;
              if (lastReasoningDeltas[blockId] === delta.reasoning_content) {
                return;
              }
              lastReasoningDeltas[blockId] = delta.reasoning_content;
              if (contentBlocks[blockId] == null) {
                contentBlocks[blockId] = { type: "reasoning" };
                controller.enqueue({
                  type: "reasoning-start",
                  id: blockId
                });
              }
              controller.enqueue({
                type: "reasoning-delta",
                id: blockId,
                delta: delta.reasoning_content
              });
            }
            if (delta.tool_calls != null) {
              for (const toolCall of delta.tool_calls) {
                const toolCallId = toolCall.id;
                controller.enqueue({
                  type: "tool-input-start",
                  id: toolCallId,
                  toolName: toolCall.function.name
                });
                controller.enqueue({
                  type: "tool-input-delta",
                  id: toolCallId,
                  delta: toolCall.function.arguments
                });
                controller.enqueue({
                  type: "tool-input-end",
                  id: toolCallId
                });
                controller.enqueue({
                  type: "tool-call",
                  toolCallId,
                  toolName: toolCall.function.name,
                  input: toolCall.function.arguments
                });
              }
            }
          },
          flush(controller) {
            for (const [blockId, block] of Object.entries(contentBlocks)) {
              controller.enqueue({
                type: block.type === "text" ? "text-end" : "reasoning-end",
                id: blockId
              });
            }
            controller.enqueue({ type: "finish", finishReason, usage });
          }
        })
      ),
      request: { body },
      response: { headers: responseHeaders }
    };
  }
};
var xaiUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  completion_tokens_details: z.object({
    reasoning_tokens: z.number().nullish()
  }).nullish()
});
var xaiChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal("assistant"),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        tool_calls: z.array(
          z.object({
            id: z.string(),
            type: z.literal("function"),
            function: z.object({
              name: z.string(),
              arguments: z.string()
            })
          })
        ).nullish()
      }),
      index: z.number(),
      finish_reason: z.string().nullish()
    })
  ),
  object: z.literal("chat.completion"),
  usage: xaiUsageSchema,
  citations: z.array(z.string().url()).nullish()
});
var xaiChatChunkSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.enum(["assistant"]).optional(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        tool_calls: z.array(
          z.object({
            id: z.string(),
            type: z.literal("function"),
            function: z.object({
              name: z.string(),
              arguments: z.string()
            })
          })
        ).nullish()
      }),
      finish_reason: z.string().nullish(),
      index: z.number()
    })
  ),
  usage: xaiUsageSchema.nullish(),
  citations: z.array(z.string().url()).nullish()
});
var xaiErrorStructure = {
  errorSchema: xaiErrorDataSchema,
  errorToMessage: (data) => data.error.message
};
function createXai(options = {}) {
  var _a;
  const baseURL = withoutTrailingSlash(
    (_a = options.baseURL) != null ? _a : "https://api.x.ai/v1"
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "XAI_API_KEY",
      description: "xAI API key"
    })}`,
    ...options.headers
  });
  const createLanguageModel = (modelId) => {
    return new XaiChatLanguageModel(modelId, {
      provider: "xai.chat",
      baseURL,
      headers: getHeaders,
      generateId,
      fetch: options.fetch
    });
  };
  const createImageModel = (modelId) => {
    return new OpenAICompatibleImageModel(modelId, {
      provider: "xai.image",
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: xaiErrorStructure
    });
  };
  const provider = (modelId) => createLanguageModel(modelId);
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  provider.imageModel = createImageModel;
  provider.image = createImageModel;
  return provider;
}
var xai = createXai();

export { createXai, xai };
