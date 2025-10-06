import { k as withoutTrailingSlash, m as NoSuchModelError, n as createProviderDefinedToolFactory, q as loadApiKey, t as parseProviderOptions, y as postJsonToApi, v as combineHeaders, o as generateId, D as InvalidResponseDataError, E as isParsableJson, z as createJsonResponseHandler, A as createEventSourceResponseHandler, u as UnsupportedFunctionalityError, B as convertToBase64, F as convertBase64ToUint8Array, G as postFormDataToApi, C as createJsonErrorResponseHandler } from './index.mjs';
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

function convertToGroqChatMessages(prompt) {
  const messages = [];
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
                if (!part.mediaType.startsWith("image/")) {
                  throw new UnsupportedFunctionalityError({
                    functionality: "Non-image file content parts"
                  });
                }
                const mediaType = part.mediaType === "image/*" ? "image/jpeg" : part.mediaType;
                return {
                  type: "image_url",
                  image_url: {
                    url: part.data instanceof URL ? part.data.toString() : `data:${mediaType};base64,${convertToBase64(part.data)}`
                  }
                };
              }
            }
          })
        });
        break;
      }
      case "assistant": {
        let text = "";
        let reasoning = "";
        const toolCalls = [];
        for (const part of content) {
          switch (part.type) {
            // groq supports reasoning for tool-calls in multi-turn conversations
            // https://github.com/vercel/ai/issues/7860
            case "reasoning": {
              reasoning += part.text;
              break;
            }
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
          ...reasoning.length > 0 ? { reasoning } : null,
          ...toolCalls.length > 0 ? { tool_calls: toolCalls } : null
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
  return messages;
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
var groqProviderOptions = z.object({
  reasoningFormat: z.enum(["parsed", "raw", "hidden"]).optional(),
  reasoningEffort: z.string().optional(),
  /**
   * Whether to enable parallel function calling during tool use. Default to true.
   */
  parallelToolCalls: z.boolean().optional(),
  /**
   * A unique identifier representing your end-user, which can help OpenAI to
   * monitor and detect abuse. Learn more.
   */
  user: z.string().optional(),
  /**
   * Whether to use structured outputs.
   *
   * @default true
   */
  structuredOutputs: z.boolean().optional()
});
var groqErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string()
  })
});
var groqFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: groqErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
var BROWSER_SEARCH_SUPPORTED_MODELS = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b"
];
function isBrowserSearchSupportedModel(modelId) {
  return BROWSER_SEARCH_SUPPORTED_MODELS.includes(modelId);
}
function getSupportedModelsString() {
  return BROWSER_SEARCH_SUPPORTED_MODELS.join(", ");
}
function prepareTools({
  tools,
  toolChoice,
  modelId
}) {
  tools = (tools == null ? void 0 : tools.length) ? tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tools: void 0, toolChoice: void 0, toolWarnings };
  }
  const groqTools2 = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      if (tool.id === "groq.browser_search") {
        if (!isBrowserSearchSupportedModel(modelId)) {
          toolWarnings.push({
            type: "unsupported-tool",
            tool,
            details: `Browser search is only supported on the following models: ${getSupportedModelsString()}. Current model: ${modelId}`
          });
        } else {
          groqTools2.push({
            type: "browser_search"
          });
        }
      } else {
        toolWarnings.push({ type: "unsupported-tool", tool });
      }
    } else {
      groqTools2.push({
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
    return { tools: groqTools2, toolChoice: void 0, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: groqTools2, toolChoice: type, toolWarnings };
    case "tool":
      return {
        tools: groqTools2,
        toolChoice: {
          type: "function",
          function: {
            name: toolChoice.toolName
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
function mapGroqFinishReason(finishReason) {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content-filter";
    case "function_call":
    case "tool_calls":
      return "tool-calls";
    default:
      return "unknown";
  }
}
var GroqChatLanguageModel = class {
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
    responseFormat,
    seed,
    stream,
    tools,
    toolChoice,
    providerOptions
  }) {
    var _a, _b;
    const warnings = [];
    const groqOptions = await parseProviderOptions({
      provider: "groq",
      providerOptions,
      schema: groqProviderOptions
    });
    const structuredOutputs = (_a = groqOptions == null ? void 0 : groqOptions.structuredOutputs) != null ? _a : true;
    if (topK != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "topK"
      });
    }
    if ((responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && !structuredOutputs) {
      warnings.push({
        type: "unsupported-setting",
        setting: "responseFormat",
        details: "JSON response format schema is only supported with structuredOutputs"
      });
    }
    const {
      tools: groqTools2,
      toolChoice: groqToolChoice,
      toolWarnings
    } = prepareTools({ tools, toolChoice, modelId: this.modelId });
    return {
      args: {
        // model id:
        model: this.modelId,
        // model specific settings:
        user: groqOptions == null ? void 0 : groqOptions.user,
        parallel_tool_calls: groqOptions == null ? void 0 : groqOptions.parallelToolCalls,
        // standardized settings:
        max_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        stop: stopSequences,
        seed,
        // response format:
        response_format: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? structuredOutputs && responseFormat.schema != null ? {
          type: "json_schema",
          json_schema: {
            schema: responseFormat.schema,
            name: (_b = responseFormat.name) != null ? _b : "response",
            description: responseFormat.description
          }
        } : { type: "json_object" } : void 0,
        // provider options:
        reasoning_format: groqOptions == null ? void 0 : groqOptions.reasoningFormat,
        reasoning_effort: groqOptions == null ? void 0 : groqOptions.reasoningEffort,
        // messages:
        messages: convertToGroqChatMessages(prompt),
        // tools:
        tools: groqTools2,
        tool_choice: groqToolChoice
      },
      warnings: [...warnings, ...toolWarnings]
    };
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e, _f, _g;
    const { args, warnings } = await this.getArgs({
      ...options,
      stream: false
    });
    const body = JSON.stringify(args);
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: groqFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        groqChatResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const choice = response.choices[0];
    const content = [];
    const text = choice.message.content;
    if (text != null && text.length > 0) {
      content.push({ type: "text", text });
    }
    const reasoning = choice.message.reasoning;
    if (reasoning != null && reasoning.length > 0) {
      content.push({
        type: "reasoning",
        text: reasoning
      });
    }
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: "tool-call",
          toolCallId: (_a = toolCall.id) != null ? _a : generateId(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments
        });
      }
    }
    return {
      content,
      finishReason: mapGroqFinishReason(choice.finish_reason),
      usage: {
        inputTokens: (_c = (_b = response.usage) == null ? void 0 : _b.prompt_tokens) != null ? _c : void 0,
        outputTokens: (_e = (_d = response.usage) == null ? void 0 : _d.completion_tokens) != null ? _e : void 0,
        totalTokens: (_g = (_f = response.usage) == null ? void 0 : _f.total_tokens) != null ? _g : void 0
      },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse
      },
      warnings,
      request: { body }
    };
  }
  async doStream(options) {
    const { args, warnings } = await this.getArgs({ ...options, stream: true });
    const body = JSON.stringify({ ...args, stream: true });
    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...args,
        stream: true
      },
      failedResponseHandler: groqFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(groqChatChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const toolCalls = [];
    let finishReason = "unknown";
    const usage = {
      inputTokens: void 0,
      outputTokens: void 0,
      totalTokens: void 0
    };
    let isFirstChunk = true;
    let isActiveText = false;
    let isActiveReasoning = false;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings });
          },
          transform(chunk, controller) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
            if (options.includeRawChunks) {
              controller.enqueue({ type: "raw", rawValue: chunk.rawValue });
            }
            if (!chunk.success) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            if ("error" in value) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: value.error });
              return;
            }
            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value)
              });
            }
            if (((_a = value.x_groq) == null ? void 0 : _a.usage) != null) {
              usage.inputTokens = (_b = value.x_groq.usage.prompt_tokens) != null ? _b : void 0;
              usage.outputTokens = (_c = value.x_groq.usage.completion_tokens) != null ? _c : void 0;
              usage.totalTokens = (_d = value.x_groq.usage.total_tokens) != null ? _d : void 0;
            }
            const choice = value.choices[0];
            if ((choice == null ? void 0 : choice.finish_reason) != null) {
              finishReason = mapGroqFinishReason(choice.finish_reason);
            }
            if ((choice == null ? void 0 : choice.delta) == null) {
              return;
            }
            const delta = choice.delta;
            if (delta.reasoning != null && delta.reasoning.length > 0) {
              if (!isActiveReasoning) {
                controller.enqueue({
                  type: "reasoning-start",
                  id: "reasoning-0"
                });
                isActiveReasoning = true;
              }
              controller.enqueue({
                type: "reasoning-delta",
                id: "reasoning-0",
                delta: delta.reasoning
              });
            }
            if (delta.content != null && delta.content.length > 0) {
              if (!isActiveText) {
                controller.enqueue({ type: "text-start", id: "txt-0" });
                isActiveText = true;
              }
              controller.enqueue({
                type: "text-delta",
                id: "txt-0",
                delta: delta.content
              });
            }
            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;
                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== "function") {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`
                    });
                  }
                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`
                    });
                  }
                  if (((_e = toolCallDelta.function) == null ? void 0 : _e.name) == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`
                    });
                  }
                  controller.enqueue({
                    type: "tool-input-start",
                    id: toolCallDelta.id,
                    toolName: toolCallDelta.function.name
                  });
                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: "function",
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: (_f = toolCallDelta.function.arguments) != null ? _f : ""
                    },
                    hasFinished: false
                  };
                  const toolCall2 = toolCalls[index];
                  if (((_g = toolCall2.function) == null ? void 0 : _g.name) != null && ((_h = toolCall2.function) == null ? void 0 : _h.arguments) != null) {
                    if (toolCall2.function.arguments.length > 0) {
                      controller.enqueue({
                        type: "tool-input-delta",
                        id: toolCall2.id,
                        delta: toolCall2.function.arguments
                      });
                    }
                    if (isParsableJson(toolCall2.function.arguments)) {
                      controller.enqueue({
                        type: "tool-input-end",
                        id: toolCall2.id
                      });
                      controller.enqueue({
                        type: "tool-call",
                        toolCallId: (_i = toolCall2.id) != null ? _i : generateId(),
                        toolName: toolCall2.function.name,
                        input: toolCall2.function.arguments
                      });
                      toolCall2.hasFinished = true;
                    }
                  }
                  continue;
                }
                const toolCall = toolCalls[index];
                if (toolCall.hasFinished) {
                  continue;
                }
                if (((_j = toolCallDelta.function) == null ? void 0 : _j.arguments) != null) {
                  toolCall.function.arguments += (_l = (_k = toolCallDelta.function) == null ? void 0 : _k.arguments) != null ? _l : "";
                }
                controller.enqueue({
                  type: "tool-input-delta",
                  id: toolCall.id,
                  delta: (_m = toolCallDelta.function.arguments) != null ? _m : ""
                });
                if (((_n = toolCall.function) == null ? void 0 : _n.name) != null && ((_o = toolCall.function) == null ? void 0 : _o.arguments) != null && isParsableJson(toolCall.function.arguments)) {
                  controller.enqueue({
                    type: "tool-input-end",
                    id: toolCall.id
                  });
                  controller.enqueue({
                    type: "tool-call",
                    toolCallId: (_p = toolCall.id) != null ? _p : generateId(),
                    toolName: toolCall.function.name,
                    input: toolCall.function.arguments
                  });
                  toolCall.hasFinished = true;
                }
              }
            }
          },
          flush(controller) {
            if (isActiveReasoning) {
              controller.enqueue({ type: "reasoning-end", id: "reasoning-0" });
            }
            if (isActiveText) {
              controller.enqueue({ type: "text-end", id: "txt-0" });
            }
            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
              ...{}
            });
          }
        })
      ),
      request: { body },
      response: { headers: responseHeaders }
    };
  }
};
var groqChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullish(),
        reasoning: z.string().nullish(),
        tool_calls: z.array(
          z.object({
            id: z.string().nullish(),
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
  usage: z.object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    total_tokens: z.number().nullish()
  }).nullish()
});
var groqChatChunkSchema = z.union([
  z.object({
    id: z.string().nullish(),
    created: z.number().nullish(),
    model: z.string().nullish(),
    choices: z.array(
      z.object({
        delta: z.object({
          content: z.string().nullish(),
          reasoning: z.string().nullish(),
          tool_calls: z.array(
            z.object({
              index: z.number(),
              id: z.string().nullish(),
              type: z.literal("function").optional(),
              function: z.object({
                name: z.string().nullish(),
                arguments: z.string().nullish()
              })
            })
          ).nullish()
        }).nullish(),
        finish_reason: z.string().nullable().optional(),
        index: z.number()
      })
    ),
    x_groq: z.object({
      usage: z.object({
        prompt_tokens: z.number().nullish(),
        completion_tokens: z.number().nullish(),
        total_tokens: z.number().nullish()
      }).nullish()
    }).nullish()
  }),
  groqErrorDataSchema
]);
var groqProviderOptionsSchema = z.object({
  language: z.string().nullish(),
  prompt: z.string().nullish(),
  responseFormat: z.string().nullish(),
  temperature: z.number().min(0).max(1).nullish(),
  timestampGranularities: z.array(z.string()).nullish()
});
var GroqTranscriptionModel = class {
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
    this.specificationVersion = "v2";
  }
  get provider() {
    return this.config.provider;
  }
  async getArgs({
    audio,
    mediaType,
    providerOptions
  }) {
    var _a, _b, _c, _d, _e;
    const warnings = [];
    const groqOptions = await parseProviderOptions({
      provider: "groq",
      providerOptions,
      schema: groqProviderOptionsSchema
    });
    const formData = new FormData();
    const blob = audio instanceof Uint8Array ? new Blob([audio]) : new Blob([convertBase64ToUint8Array(audio)]);
    formData.append("model", this.modelId);
    formData.append("file", new File([blob], "audio", { type: mediaType }));
    if (groqOptions) {
      const transcriptionModelOptions = {
        language: (_a = groqOptions.language) != null ? _a : void 0,
        prompt: (_b = groqOptions.prompt) != null ? _b : void 0,
        response_format: (_c = groqOptions.responseFormat) != null ? _c : void 0,
        temperature: (_d = groqOptions.temperature) != null ? _d : void 0,
        timestamp_granularities: (_e = groqOptions.timestampGranularities) != null ? _e : void 0
      };
      for (const key in transcriptionModelOptions) {
        const value = transcriptionModelOptions[key];
        if (value !== void 0) {
          formData.append(key, String(value));
        }
      }
    }
    return {
      formData,
      warnings
    };
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e;
    const currentDate = (_c = (_b = (_a = this.config._internal) == null ? void 0 : _a.currentDate) == null ? void 0 : _b.call(_a)) != null ? _c : /* @__PURE__ */ new Date();
    const { formData, warnings } = await this.getArgs(options);
    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse
    } = await postFormDataToApi({
      url: this.config.url({
        path: "/audio/transcriptions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      failedResponseHandler: groqFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        groqTranscriptionResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    return {
      text: response.text,
      segments: (_e = (_d = response.segments) == null ? void 0 : _d.map((segment) => ({
        text: segment.text,
        startSecond: segment.start,
        endSecond: segment.end
      }))) != null ? _e : [],
      language: response.language,
      durationInSeconds: response.duration,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse
      }
    };
  }
};
var groqTranscriptionResponseSchema = z.object({
  task: z.string(),
  language: z.string(),
  duration: z.number(),
  text: z.string(),
  segments: z.array(
    z.object({
      id: z.number(),
      seek: z.number(),
      start: z.number(),
      end: z.number(),
      text: z.string(),
      tokens: z.array(z.number()),
      temperature: z.number(),
      avg_logprob: z.number(),
      compression_ratio: z.number(),
      no_speech_prob: z.number()
    })
  ),
  x_groq: z.object({
    id: z.string()
  })
});
var browserSearch = createProviderDefinedToolFactory({
  id: "groq.browser_search",
  name: "browser_search",
  inputSchema: z.object({})
});
var groqTools = {
  browserSearch
};
function createGroq(options = {}) {
  var _a;
  const baseURL = (_a = withoutTrailingSlash(options.baseURL)) != null ? _a : "https://api.groq.com/openai/v1";
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "GROQ_API_KEY",
      description: "Groq"
    })}`,
    ...options.headers
  });
  const createChatModel = (modelId) => new GroqChatLanguageModel(modelId, {
    provider: "groq.chat",
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createLanguageModel = (modelId) => {
    if (new.target) {
      throw new Error(
        "The Groq model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId);
  };
  const createTranscriptionModel = (modelId) => {
    return new GroqTranscriptionModel(modelId, {
      provider: "groq.transcription",
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch
    });
  };
  const provider = function(modelId) {
    return createLanguageModel(modelId);
  };
  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  provider.imageModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "imageModel" });
  };
  provider.transcription = createTranscriptionModel;
  provider.tools = groqTools;
  return provider;
}
var groq = createGroq();

export { browserSearch, createGroq, groq };
