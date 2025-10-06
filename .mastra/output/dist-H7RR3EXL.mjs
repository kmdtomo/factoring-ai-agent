import { k as withoutTrailingSlash, m as NoSuchModelError, n as createProviderDefinedToolFactory, o as generateId, q as loadApiKey, s as createProviderDefinedToolFactoryWithOutputSchema, t as parseProviderOptions, u as UnsupportedFunctionalityError, v as combineHeaders, x as resolve, y as postJsonToApi, z as createJsonResponseHandler, A as createEventSourceResponseHandler, B as convertToBase64, C as createJsonErrorResponseHandler } from './index.mjs';
import z6__default, { z } from 'zod/v4';
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

var anthropicErrorDataSchema = z.object({
  type: z.literal("error"),
  error: z.object({
    type: z.string(),
    message: z.string()
  })
});
var anthropicFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: anthropicErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
var anthropicFilePartProviderOptions = z.object({
  /**
   * Citation configuration for this document.
   * When enabled, this document will generate citations in the response.
   */
  citations: z.object({
    /**
     * Enable citations for this document
     */
    enabled: z.boolean()
  }).optional(),
  /**
   * Custom title for the document.
   * If not provided, the filename will be used.
   */
  title: z.string().optional(),
  /**
   * Context about the document that will be passed to the model
   * but not used towards cited content.
   * Useful for storing document metadata as text or stringified JSON.
   */
  context: z.string().optional()
});
var anthropicProviderOptions = z.object({
  sendReasoning: z.boolean().optional(),
  thinking: z.object({
    type: z.union([z.literal("enabled"), z.literal("disabled")]),
    budgetTokens: z.number().optional()
  }).optional(),
  /**
   * Whether to disable parallel function calling during tool use. Default is false.
   * When set to true, Claude will use at most one tool per response.
   */
  disableParallelToolUse: z.boolean().optional()
});
function getCacheControl(providerMetadata) {
  var _a;
  const anthropic2 = providerMetadata == null ? void 0 : providerMetadata.anthropic;
  const cacheControlValue = (_a = anthropic2 == null ? void 0 : anthropic2.cacheControl) != null ? _a : anthropic2 == null ? void 0 : anthropic2.cache_control;
  return cacheControlValue;
}
var webSearch_20250305ArgsSchema = z.object({
  /**
   * Maximum number of web searches Claude can perform during the conversation.
   */
  maxUses: z.number().optional(),
  /**
   * Optional list of domains that Claude is allowed to search.
   */
  allowedDomains: z.array(z.string()).optional(),
  /**
   * Optional list of domains that Claude should avoid when searching.
   */
  blockedDomains: z.array(z.string()).optional(),
  /**
   * Optional user location information to provide geographically relevant search results.
   */
  userLocation: z.object({
    type: z.literal("approximate"),
    city: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
    timezone: z.string().optional()
  }).optional()
});
var webSearch_20250305OutputSchema = z.array(
  z.object({
    url: z.string(),
    title: z.string(),
    pageAge: z.string().nullable(),
    encryptedContent: z.string(),
    type: z.string()
  })
);
var factory = createProviderDefinedToolFactoryWithOutputSchema({
  id: "anthropic.web_search_20250305",
  name: "web_search",
  inputSchema: z.object({
    query: z.string()
  }),
  outputSchema: webSearch_20250305OutputSchema
});
var webSearch_20250305 = (args = {}) => {
  return factory(args);
};
function isWebSearchTool(tool) {
  return typeof tool === "object" && tool !== null && "type" in tool && tool.type === "web_search_20250305";
}
function prepareTools({
  tools,
  toolChoice,
  disableParallelToolUse
}) {
  tools = (tools == null ? void 0 : tools.length) ? tools : void 0;
  const toolWarnings = [];
  const betas = /* @__PURE__ */ new Set();
  if (tools == null) {
    return { tools: void 0, toolChoice: void 0, toolWarnings, betas };
  }
  const anthropicTools2 = [];
  for (const tool of tools) {
    if (isWebSearchTool(tool)) {
      anthropicTools2.push(tool);
      continue;
    }
    switch (tool.type) {
      case "function":
        const cacheControl = getCacheControl(tool.providerOptions);
        anthropicTools2.push({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
          cache_control: cacheControl
        });
        break;
      case "provider-defined":
        switch (tool.id) {
          case "anthropic.computer_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: "computer",
              type: "computer_20250124",
              display_width_px: tool.args.displayWidthPx,
              display_height_px: tool.args.displayHeightPx,
              display_number: tool.args.displayNumber
            });
            break;
          case "anthropic.computer_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: "computer",
              type: "computer_20241022",
              display_width_px: tool.args.displayWidthPx,
              display_height_px: tool.args.displayHeightPx,
              display_number: tool.args.displayNumber
            });
            break;
          case "anthropic.text_editor_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: "str_replace_editor",
              type: "text_editor_20250124"
            });
            break;
          case "anthropic.text_editor_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: "str_replace_editor",
              type: "text_editor_20241022"
            });
            break;
          case "anthropic.text_editor_20250429":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: "str_replace_based_edit_tool",
              type: "text_editor_20250429"
            });
            break;
          case "anthropic.bash_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: "bash",
              type: "bash_20250124"
            });
            break;
          case "anthropic.bash_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: "bash",
              type: "bash_20241022"
            });
            break;
          case "anthropic.web_search_20250305": {
            const args = webSearch_20250305ArgsSchema.parse(tool.args);
            anthropicTools2.push({
              type: "web_search_20250305",
              name: "web_search",
              max_uses: args.maxUses,
              allowed_domains: args.allowedDomains,
              blocked_domains: args.blockedDomains,
              user_location: args.userLocation
            });
            break;
          }
          case "anthropic.code_execution_20250522": {
            betas.add("code-execution-2025-05-22");
            anthropicTools2.push({
              type: "code_execution_20250522",
              name: "code_execution"
            });
            break;
          }
          default:
            toolWarnings.push({ type: "unsupported-tool", tool });
            break;
        }
        break;
      default:
        toolWarnings.push({ type: "unsupported-tool", tool });
        break;
    }
  }
  if (toolChoice == null) {
    return {
      tools: anthropicTools2,
      toolChoice: disableParallelToolUse ? { type: "auto", disable_parallel_tool_use: disableParallelToolUse } : void 0,
      toolWarnings,
      betas
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        tools: anthropicTools2,
        toolChoice: {
          type: "auto",
          disable_parallel_tool_use: disableParallelToolUse
        },
        toolWarnings,
        betas
      };
    case "required":
      return {
        tools: anthropicTools2,
        toolChoice: {
          type: "any",
          disable_parallel_tool_use: disableParallelToolUse
        },
        toolWarnings,
        betas
      };
    case "none":
      return { tools: void 0, toolChoice: void 0, toolWarnings, betas };
    case "tool":
      return {
        tools: anthropicTools2,
        toolChoice: {
          type: "tool",
          name: toolChoice.toolName,
          disable_parallel_tool_use: disableParallelToolUse
        },
        toolWarnings,
        betas
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
var codeExecution_20250522OutputSchema = z.object({
  type: z.literal("code_execution_result"),
  stdout: z.string(),
  stderr: z.string(),
  return_code: z.number()
});
var factory2 = createProviderDefinedToolFactoryWithOutputSchema({
  id: "anthropic.code_execution_20250522",
  name: "code_execution",
  inputSchema: z.object({
    code: z.string()
  }),
  outputSchema: codeExecution_20250522OutputSchema
});
var codeExecution_20250522 = (args = {}) => {
  return factory2(args);
};
function convertToString(data) {
  if (typeof data === "string") {
    return Buffer.from(data, "base64").toString("utf-8");
  }
  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }
  if (data instanceof URL) {
    throw new UnsupportedFunctionalityError({
      functionality: "URL-based text documents are not supported for citations"
    });
  }
  throw new UnsupportedFunctionalityError({
    functionality: `unsupported data type for text documents: ${typeof data}`
  });
}
async function convertToAnthropicMessagesPrompt({
  prompt,
  sendReasoning,
  warnings
}) {
  var _a, _b, _c, _d, _e;
  const betas = /* @__PURE__ */ new Set();
  const blocks = groupIntoBlocks(prompt);
  let system = void 0;
  const messages = [];
  async function shouldEnableCitations(providerMetadata) {
    var _a2, _b2;
    const anthropicOptions = await parseProviderOptions({
      provider: "anthropic",
      providerOptions: providerMetadata,
      schema: anthropicFilePartProviderOptions
    });
    return (_b2 = (_a2 = anthropicOptions == null ? void 0 : anthropicOptions.citations) == null ? void 0 : _a2.enabled) != null ? _b2 : false;
  }
  async function getDocumentMetadata(providerMetadata) {
    const anthropicOptions = await parseProviderOptions({
      provider: "anthropic",
      providerOptions: providerMetadata,
      schema: anthropicFilePartProviderOptions
    });
    return {
      title: anthropicOptions == null ? void 0 : anthropicOptions.title,
      context: anthropicOptions == null ? void 0 : anthropicOptions.context
    };
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLastBlock = i === blocks.length - 1;
    const type = block.type;
    switch (type) {
      case "system": {
        if (system != null) {
          throw new UnsupportedFunctionalityError({
            functionality: "Multiple system messages that are separated by user/assistant messages"
          });
        }
        system = block.messages.map(({ content, providerOptions }) => ({
          type: "text",
          text: content,
          cache_control: getCacheControl(providerOptions)
        }));
        break;
      }
      case "user": {
        const anthropicContent = [];
        for (const message of block.messages) {
          const { role, content } = message;
          switch (role) {
            case "user": {
              for (let j = 0; j < content.length; j++) {
                const part = content[j];
                const isLastPart = j === content.length - 1;
                const cacheControl = (_a = getCacheControl(part.providerOptions)) != null ? _a : isLastPart ? getCacheControl(message.providerOptions) : void 0;
                switch (part.type) {
                  case "text": {
                    anthropicContent.push({
                      type: "text",
                      text: part.text,
                      cache_control: cacheControl
                    });
                    break;
                  }
                  case "file": {
                    if (part.mediaType.startsWith("image/")) {
                      anthropicContent.push({
                        type: "image",
                        source: part.data instanceof URL ? {
                          type: "url",
                          url: part.data.toString()
                        } : {
                          type: "base64",
                          media_type: part.mediaType === "image/*" ? "image/jpeg" : part.mediaType,
                          data: convertToBase64(part.data)
                        },
                        cache_control: cacheControl
                      });
                    } else if (part.mediaType === "application/pdf") {
                      betas.add("pdfs-2024-09-25");
                      const enableCitations = await shouldEnableCitations(
                        part.providerOptions
                      );
                      const metadata = await getDocumentMetadata(
                        part.providerOptions
                      );
                      anthropicContent.push({
                        type: "document",
                        source: part.data instanceof URL ? {
                          type: "url",
                          url: part.data.toString()
                        } : {
                          type: "base64",
                          media_type: "application/pdf",
                          data: convertToBase64(part.data)
                        },
                        title: (_b = metadata.title) != null ? _b : part.filename,
                        ...metadata.context && { context: metadata.context },
                        ...enableCitations && {
                          citations: { enabled: true }
                        },
                        cache_control: cacheControl
                      });
                    } else if (part.mediaType === "text/plain") {
                      const enableCitations = await shouldEnableCitations(
                        part.providerOptions
                      );
                      const metadata = await getDocumentMetadata(
                        part.providerOptions
                      );
                      anthropicContent.push({
                        type: "document",
                        source: part.data instanceof URL ? {
                          type: "url",
                          url: part.data.toString()
                        } : {
                          type: "text",
                          media_type: "text/plain",
                          data: convertToString(part.data)
                        },
                        title: (_c = metadata.title) != null ? _c : part.filename,
                        ...metadata.context && { context: metadata.context },
                        ...enableCitations && {
                          citations: { enabled: true }
                        },
                        cache_control: cacheControl
                      });
                    } else {
                      throw new UnsupportedFunctionalityError({
                        functionality: `media type: ${part.mediaType}`
                      });
                    }
                    break;
                  }
                }
              }
              break;
            }
            case "tool": {
              for (let i2 = 0; i2 < content.length; i2++) {
                const part = content[i2];
                const isLastPart = i2 === content.length - 1;
                const cacheControl = (_d = getCacheControl(part.providerOptions)) != null ? _d : isLastPart ? getCacheControl(message.providerOptions) : void 0;
                const output = part.output;
                let contentValue;
                switch (output.type) {
                  case "content":
                    contentValue = output.value.map((contentPart) => {
                      switch (contentPart.type) {
                        case "text":
                          return {
                            type: "text",
                            text: contentPart.text,
                            cache_control: void 0
                          };
                        case "media": {
                          if (contentPart.mediaType.startsWith("image/")) {
                            return {
                              type: "image",
                              source: {
                                type: "base64",
                                media_type: contentPart.mediaType,
                                data: contentPart.data
                              },
                              cache_control: void 0
                            };
                          }
                          throw new UnsupportedFunctionalityError({
                            functionality: `media type: ${contentPart.mediaType}`
                          });
                        }
                      }
                    });
                    break;
                  case "text":
                  case "error-text":
                    contentValue = output.value;
                    break;
                  case "json":
                  case "error-json":
                  default:
                    contentValue = JSON.stringify(output.value);
                    break;
                }
                anthropicContent.push({
                  type: "tool_result",
                  tool_use_id: part.toolCallId,
                  content: contentValue,
                  is_error: output.type === "error-text" || output.type === "error-json" ? true : void 0,
                  cache_control: cacheControl
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
        messages.push({ role: "user", content: anthropicContent });
        break;
      }
      case "assistant": {
        const anthropicContent = [];
        for (let j = 0; j < block.messages.length; j++) {
          const message = block.messages[j];
          const isLastMessage = j === block.messages.length - 1;
          const { content } = message;
          for (let k = 0; k < content.length; k++) {
            const part = content[k];
            const isLastContentPart = k === content.length - 1;
            const cacheControl = (_e = getCacheControl(part.providerOptions)) != null ? _e : isLastContentPart ? getCacheControl(message.providerOptions) : void 0;
            switch (part.type) {
              case "text": {
                anthropicContent.push({
                  type: "text",
                  text: (
                    // trim the last text part if it's the last message in the block
                    // because Anthropic does not allow trailing whitespace
                    // in pre-filled assistant responses
                    isLastBlock && isLastMessage && isLastContentPart ? part.text.trim() : part.text
                  ),
                  cache_control: cacheControl
                });
                break;
              }
              case "reasoning": {
                if (sendReasoning) {
                  const reasoningMetadata = await parseProviderOptions({
                    provider: "anthropic",
                    providerOptions: part.providerOptions,
                    schema: anthropicReasoningMetadataSchema
                  });
                  if (reasoningMetadata != null) {
                    if (reasoningMetadata.signature != null) {
                      anthropicContent.push({
                        type: "thinking",
                        thinking: part.text,
                        signature: reasoningMetadata.signature,
                        cache_control: cacheControl
                      });
                    } else if (reasoningMetadata.redactedData != null) {
                      anthropicContent.push({
                        type: "redacted_thinking",
                        data: reasoningMetadata.redactedData,
                        cache_control: cacheControl
                      });
                    } else {
                      warnings.push({
                        type: "other",
                        message: "unsupported reasoning metadata"
                      });
                    }
                  } else {
                    warnings.push({
                      type: "other",
                      message: "unsupported reasoning metadata"
                    });
                  }
                } else {
                  warnings.push({
                    type: "other",
                    message: "sending reasoning content is disabled for this model"
                  });
                }
                break;
              }
              case "tool-call": {
                if (part.providerExecuted) {
                  if (part.toolName === "web_search") {
                    anthropicContent.push({
                      type: "server_tool_use",
                      id: part.toolCallId,
                      name: "web_search",
                      input: part.input,
                      cache_control: cacheControl
                    });
                    break;
                  }
                  if (part.toolName === "code_execution") {
                    anthropicContent.push({
                      type: "server_tool_use",
                      id: part.toolCallId,
                      name: "code_execution",
                      input: part.input,
                      cache_control: cacheControl
                    });
                    break;
                  }
                  warnings.push({
                    type: "other",
                    message: `provider executed tool call for tool ${part.toolName} is not supported`
                  });
                  break;
                }
                anthropicContent.push({
                  type: "tool_use",
                  id: part.toolCallId,
                  name: part.toolName,
                  input: part.input,
                  cache_control: cacheControl
                });
                break;
              }
              case "tool-result": {
                if (part.toolName === "web_search") {
                  const output = part.output;
                  if (output.type !== "json") {
                    warnings.push({
                      type: "other",
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`
                    });
                    break;
                  }
                  const webSearchOutput = webSearch_20250305OutputSchema.parse(
                    output.value
                  );
                  anthropicContent.push({
                    type: "web_search_tool_result",
                    tool_use_id: part.toolCallId,
                    content: webSearchOutput.map((result) => ({
                      url: result.url,
                      title: result.title,
                      page_age: result.pageAge,
                      encrypted_content: result.encryptedContent,
                      type: result.type
                    })),
                    cache_control: cacheControl
                  });
                  break;
                }
                if (part.toolName === "code_execution") {
                  const output = part.output;
                  if (output.type !== "json") {
                    warnings.push({
                      type: "other",
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`
                    });
                    break;
                  }
                  const codeExecutionOutput = codeExecution_20250522OutputSchema.parse(output.value);
                  anthropicContent.push({
                    type: "code_execution_tool_result",
                    tool_use_id: part.toolCallId,
                    content: {
                      type: codeExecutionOutput.type,
                      stdout: codeExecutionOutput.stdout,
                      stderr: codeExecutionOutput.stderr,
                      return_code: codeExecutionOutput.return_code
                    },
                    cache_control: cacheControl
                  });
                  break;
                }
                warnings.push({
                  type: "other",
                  message: `provider executed tool result for tool ${part.toolName} is not supported`
                });
                break;
              }
            }
          }
        }
        messages.push({ role: "assistant", content: anthropicContent });
        break;
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`content type: ${_exhaustiveCheck}`);
      }
    }
  }
  return {
    prompt: { system, messages },
    betas
  };
}
function groupIntoBlocks(prompt) {
  const blocks = [];
  let currentBlock = void 0;
  for (const message of prompt) {
    const { role } = message;
    switch (role) {
      case "system": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "system") {
          currentBlock = { type: "system", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "assistant": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "assistant") {
          currentBlock = { type: "assistant", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "user": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "tool": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return blocks;
}
function mapAnthropicStopReason({
  finishReason,
  isJsonResponseFromTool
}) {
  switch (finishReason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return isJsonResponseFromTool ? "stop" : "tool-calls";
    case "max_tokens":
      return "length";
    default:
      return "unknown";
  }
}
var citationSchemas = {
  webSearchResult: z.object({
    type: z.literal("web_search_result_location"),
    cited_text: z.string(),
    url: z.string(),
    title: z.string(),
    encrypted_index: z.string()
  }),
  pageLocation: z.object({
    type: z.literal("page_location"),
    cited_text: z.string(),
    document_index: z.number(),
    document_title: z.string().nullable(),
    start_page_number: z.number(),
    end_page_number: z.number()
  }),
  charLocation: z.object({
    type: z.literal("char_location"),
    cited_text: z.string(),
    document_index: z.number(),
    document_title: z.string().nullable(),
    start_char_index: z.number(),
    end_char_index: z.number()
  })
};
var citationSchema = z.discriminatedUnion("type", [
  citationSchemas.webSearchResult,
  citationSchemas.pageLocation,
  citationSchemas.charLocation
]);
z.discriminatedUnion("type", [
  citationSchemas.pageLocation,
  citationSchemas.charLocation
]);
function processCitation(citation, citationDocuments, generateId3, onSource) {
  if (citation.type === "page_location" || citation.type === "char_location") {
    const source = createCitationSource(
      citation,
      citationDocuments,
      generateId3
    );
    if (source) {
      onSource(source);
    }
  }
}
function createCitationSource(citation, citationDocuments, generateId3) {
  var _a;
  const documentInfo = citationDocuments[citation.document_index];
  if (!documentInfo) {
    return null;
  }
  const providerMetadata = citation.type === "page_location" ? {
    citedText: citation.cited_text,
    startPageNumber: citation.start_page_number,
    endPageNumber: citation.end_page_number
  } : {
    citedText: citation.cited_text,
    startCharIndex: citation.start_char_index,
    endCharIndex: citation.end_char_index
  };
  return {
    type: "source",
    sourceType: "document",
    id: generateId3(),
    mediaType: documentInfo.mediaType,
    title: (_a = citation.document_title) != null ? _a : documentInfo.title,
    filename: documentInfo.filename,
    providerMetadata: {
      anthropic: providerMetadata
    }
  };
}
var AnthropicMessagesLanguageModel = class {
  constructor(modelId, config) {
    this.specificationVersion = "v2";
    var _a;
    this.modelId = modelId;
    this.config = config;
    this.generateId = (_a = config.generateId) != null ? _a : generateId;
  }
  supportsUrl(url) {
    return url.protocol === "https:";
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
    maxOutputTokens = 4096,
    // 4096: max model output tokens TODO update default in v5
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
    var _a, _b, _c;
    const warnings = [];
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
    if (seed != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "seed"
      });
    }
    if ((responseFormat == null ? void 0 : responseFormat.type) === "json") {
      if (responseFormat.schema == null) {
        warnings.push({
          type: "unsupported-setting",
          setting: "responseFormat",
          details: "JSON response format requires a schema. The response format is ignored."
        });
      } else if (tools != null) {
        warnings.push({
          type: "unsupported-setting",
          setting: "tools",
          details: "JSON response format does not support tools. The provided tools are ignored."
        });
      }
    }
    const jsonResponseTool = (responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null ? {
      type: "function",
      name: "json",
      description: "Respond with a JSON object.",
      inputSchema: responseFormat.schema
    } : void 0;
    const anthropicOptions = await parseProviderOptions({
      provider: "anthropic",
      providerOptions,
      schema: anthropicProviderOptions
    });
    const { prompt: messagesPrompt, betas: messagesBetas } = await convertToAnthropicMessagesPrompt({
      prompt,
      sendReasoning: (_a = anthropicOptions == null ? void 0 : anthropicOptions.sendReasoning) != null ? _a : true,
      warnings
    });
    const isThinking = ((_b = anthropicOptions == null ? void 0 : anthropicOptions.thinking) == null ? void 0 : _b.type) === "enabled";
    const thinkingBudget = (_c = anthropicOptions == null ? void 0 : anthropicOptions.thinking) == null ? void 0 : _c.budgetTokens;
    const baseArgs = {
      // model id:
      model: this.modelId,
      // standardized settings:
      max_tokens: maxOutputTokens,
      temperature,
      top_k: topK,
      top_p: topP,
      stop_sequences: stopSequences,
      // provider specific settings:
      ...isThinking && {
        thinking: { type: "enabled", budget_tokens: thinkingBudget }
      },
      // prompt:
      system: messagesPrompt.system,
      messages: messagesPrompt.messages
    };
    if (isThinking) {
      if (thinkingBudget == null) {
        throw new UnsupportedFunctionalityError({
          functionality: "thinking requires a budget"
        });
      }
      if (baseArgs.temperature != null) {
        baseArgs.temperature = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "temperature",
          details: "temperature is not supported when thinking is enabled"
        });
      }
      if (topK != null) {
        baseArgs.top_k = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "topK",
          details: "topK is not supported when thinking is enabled"
        });
      }
      if (topP != null) {
        baseArgs.top_p = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "topP",
          details: "topP is not supported when thinking is enabled"
        });
      }
      baseArgs.max_tokens = maxOutputTokens + thinkingBudget;
    }
    const {
      tools: anthropicTools2,
      toolChoice: anthropicToolChoice,
      toolWarnings,
      betas: toolsBetas
    } = prepareTools(
      jsonResponseTool != null ? {
        tools: [jsonResponseTool],
        toolChoice: { type: "tool", toolName: jsonResponseTool.name },
        disableParallelToolUse: anthropicOptions == null ? void 0 : anthropicOptions.disableParallelToolUse
      } : {
        tools: tools != null ? tools : [],
        toolChoice,
        disableParallelToolUse: anthropicOptions == null ? void 0 : anthropicOptions.disableParallelToolUse
      }
    );
    return {
      args: {
        ...baseArgs,
        tools: anthropicTools2,
        tool_choice: anthropicToolChoice
      },
      warnings: [...warnings, ...toolWarnings],
      betas: /* @__PURE__ */ new Set([...messagesBetas, ...toolsBetas]),
      usesJsonResponseTool: jsonResponseTool != null
    };
  }
  async getHeaders({
    betas,
    headers
  }) {
    return combineHeaders(
      await resolve(this.config.headers),
      betas.size > 0 ? { "anthropic-beta": Array.from(betas).join(",") } : {},
      headers
    );
  }
  buildRequestUrl(isStreaming) {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.config).buildRequestUrl) == null ? void 0 : _b.call(_a, this.config.baseURL, isStreaming)) != null ? _c : `${this.config.baseURL}/messages`;
  }
  transformRequestBody(args) {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.config).transformRequestBody) == null ? void 0 : _b.call(_a, args)) != null ? _c : args;
  }
  extractCitationDocuments(prompt) {
    const isCitationPart = (part) => {
      var _a, _b;
      if (part.type !== "file") {
        return false;
      }
      if (part.mediaType !== "application/pdf" && part.mediaType !== "text/plain") {
        return false;
      }
      const anthropic2 = (_a = part.providerOptions) == null ? void 0 : _a.anthropic;
      const citationsConfig = anthropic2 == null ? void 0 : anthropic2.citations;
      return (_b = citationsConfig == null ? void 0 : citationsConfig.enabled) != null ? _b : false;
    };
    return prompt.filter((message) => message.role === "user").flatMap((message) => message.content).filter(isCitationPart).map((part) => {
      var _a;
      const filePart = part;
      return {
        title: (_a = filePart.filename) != null ? _a : "Untitled Document",
        filename: filePart.filename,
        mediaType: filePart.mediaType
      };
    });
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e;
    const { args, warnings, betas, usesJsonResponseTool } = await this.getArgs(options);
    const citationDocuments = this.extractCitationDocuments(options.prompt);
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi({
      url: this.buildRequestUrl(false),
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(args),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicMessagesResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const content = [];
    for (const part of response.content) {
      switch (part.type) {
        case "text": {
          if (!usesJsonResponseTool) {
            content.push({ type: "text", text: part.text });
            if (part.citations) {
              for (const citation of part.citations) {
                processCitation(
                  citation,
                  citationDocuments,
                  this.generateId,
                  (source) => content.push(source)
                );
              }
            }
          }
          break;
        }
        case "thinking": {
          content.push({
            type: "reasoning",
            text: part.thinking,
            providerMetadata: {
              anthropic: {
                signature: part.signature
              }
            }
          });
          break;
        }
        case "redacted_thinking": {
          content.push({
            type: "reasoning",
            text: "",
            providerMetadata: {
              anthropic: {
                redactedData: part.data
              }
            }
          });
          break;
        }
        case "tool_use": {
          content.push(
            // when a json response tool is used, the tool call becomes the text:
            usesJsonResponseTool ? {
              type: "text",
              text: JSON.stringify(part.input)
            } : {
              type: "tool-call",
              toolCallId: part.id,
              toolName: part.name,
              input: JSON.stringify(part.input)
            }
          );
          break;
        }
        case "server_tool_use": {
          if (part.name === "web_search" || part.name === "code_execution") {
            content.push({
              type: "tool-call",
              toolCallId: part.id,
              toolName: part.name,
              input: JSON.stringify(part.input),
              providerExecuted: true
            });
          }
          break;
        }
        case "web_search_tool_result": {
          if (Array.isArray(part.content)) {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: "web_search",
              result: part.content.map((result) => {
                var _a2;
                return {
                  url: result.url,
                  title: result.title,
                  pageAge: (_a2 = result.page_age) != null ? _a2 : null,
                  encryptedContent: result.encrypted_content,
                  type: result.type
                };
              }),
              providerExecuted: true
            });
            for (const result of part.content) {
              content.push({
                type: "source",
                sourceType: "url",
                id: this.generateId(),
                url: result.url,
                title: result.title,
                providerMetadata: {
                  anthropic: {
                    pageAge: (_a = result.page_age) != null ? _a : null
                  }
                }
              });
            }
          } else {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: "web_search",
              isError: true,
              result: {
                type: "web_search_tool_result_error",
                errorCode: part.content.error_code
              },
              providerExecuted: true
            });
          }
          break;
        }
        case "code_execution_tool_result": {
          if (part.content.type === "code_execution_result") {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: "code_execution",
              result: {
                type: part.content.type,
                stdout: part.content.stdout,
                stderr: part.content.stderr,
                return_code: part.content.return_code
              },
              providerExecuted: true
            });
          } else if (part.content.type === "code_execution_tool_result_error") {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: "code_execution",
              isError: true,
              result: {
                type: "code_execution_tool_result_error",
                errorCode: part.content.error_code
              },
              providerExecuted: true
            });
          }
          break;
        }
      }
    }
    return {
      content,
      finishReason: mapAnthropicStopReason({
        finishReason: response.stop_reason,
        isJsonResponseFromTool: usesJsonResponseTool
      }),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        cachedInputTokens: (_b = response.usage.cache_read_input_tokens) != null ? _b : void 0
      },
      request: { body: args },
      response: {
        id: (_c = response.id) != null ? _c : void 0,
        modelId: (_d = response.model) != null ? _d : void 0,
        headers: responseHeaders,
        body: rawResponse
      },
      warnings,
      providerMetadata: {
        anthropic: {
          usage: response.usage,
          cacheCreationInputTokens: (_e = response.usage.cache_creation_input_tokens) != null ? _e : null
        }
      }
    };
  }
  async doStream(options) {
    const { args, warnings, betas, usesJsonResponseTool } = await this.getArgs(options);
    const citationDocuments = this.extractCitationDocuments(options.prompt);
    const body = { ...args, stream: true };
    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.buildRequestUrl(true),
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(body),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        anthropicMessagesChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    let finishReason = "unknown";
    const usage = {
      inputTokens: void 0,
      outputTokens: void 0,
      totalTokens: void 0
    };
    const contentBlocks = {};
    let providerMetadata = void 0;
    let blockType = void 0;
    const generateId3 = this.generateId;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings });
          },
          transform(chunk, controller) {
            var _a, _b, _c, _d, _e, _f, _g;
            if (options.includeRawChunks) {
              controller.enqueue({ type: "raw", rawValue: chunk.rawValue });
            }
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            switch (value.type) {
              case "ping": {
                return;
              }
              case "content_block_start": {
                const contentBlockType = value.content_block.type;
                blockType = contentBlockType;
                switch (contentBlockType) {
                  case "text": {
                    contentBlocks[value.index] = { type: "text" };
                    controller.enqueue({
                      type: "text-start",
                      id: String(value.index)
                    });
                    return;
                  }
                  case "thinking": {
                    contentBlocks[value.index] = { type: "reasoning" };
                    controller.enqueue({
                      type: "reasoning-start",
                      id: String(value.index)
                    });
                    return;
                  }
                  case "redacted_thinking": {
                    contentBlocks[value.index] = { type: "reasoning" };
                    controller.enqueue({
                      type: "reasoning-start",
                      id: String(value.index),
                      providerMetadata: {
                        anthropic: {
                          redactedData: value.content_block.data
                        }
                      }
                    });
                    return;
                  }
                  case "tool_use": {
                    contentBlocks[value.index] = usesJsonResponseTool ? { type: "text" } : {
                      type: "tool-call",
                      toolCallId: value.content_block.id,
                      toolName: value.content_block.name,
                      input: ""
                    };
                    controller.enqueue(
                      usesJsonResponseTool ? { type: "text-start", id: String(value.index) } : {
                        type: "tool-input-start",
                        id: value.content_block.id,
                        toolName: value.content_block.name
                      }
                    );
                    return;
                  }
                  case "server_tool_use": {
                    if (value.content_block.name === "web_search" || value.content_block.name === "code_execution") {
                      contentBlocks[value.index] = {
                        type: "tool-call",
                        toolCallId: value.content_block.id,
                        toolName: value.content_block.name,
                        input: "",
                        providerExecuted: true
                      };
                      controller.enqueue({
                        type: "tool-input-start",
                        id: value.content_block.id,
                        toolName: value.content_block.name,
                        providerExecuted: true
                      });
                    }
                    return;
                  }
                  case "web_search_tool_result": {
                    const part = value.content_block;
                    if (Array.isArray(part.content)) {
                      controller.enqueue({
                        type: "tool-result",
                        toolCallId: part.tool_use_id,
                        toolName: "web_search",
                        result: part.content.map((result) => {
                          var _a2;
                          return {
                            url: result.url,
                            title: result.title,
                            pageAge: (_a2 = result.page_age) != null ? _a2 : null,
                            encryptedContent: result.encrypted_content,
                            type: result.type
                          };
                        }),
                        providerExecuted: true
                      });
                      for (const result of part.content) {
                        controller.enqueue({
                          type: "source",
                          sourceType: "url",
                          id: generateId3(),
                          url: result.url,
                          title: result.title,
                          providerMetadata: {
                            anthropic: {
                              pageAge: (_a = result.page_age) != null ? _a : null
                            }
                          }
                        });
                      }
                    } else {
                      controller.enqueue({
                        type: "tool-result",
                        toolCallId: part.tool_use_id,
                        toolName: "web_search",
                        isError: true,
                        result: {
                          type: "web_search_tool_result_error",
                          errorCode: part.content.error_code
                        },
                        providerExecuted: true
                      });
                    }
                    return;
                  }
                  case "code_execution_tool_result": {
                    const part = value.content_block;
                    if (part.content.type === "code_execution_result") {
                      controller.enqueue({
                        type: "tool-result",
                        toolCallId: part.tool_use_id,
                        toolName: "code_execution",
                        result: {
                          type: part.content.type,
                          stdout: part.content.stdout,
                          stderr: part.content.stderr,
                          return_code: part.content.return_code
                        },
                        providerExecuted: true
                      });
                    } else if (part.content.type === "code_execution_tool_result_error") {
                      controller.enqueue({
                        type: "tool-result",
                        toolCallId: part.tool_use_id,
                        toolName: "code_execution",
                        isError: true,
                        result: {
                          type: "code_execution_tool_result_error",
                          errorCode: part.content.error_code
                        },
                        providerExecuted: true
                      });
                    }
                    return;
                  }
                  default: {
                    const _exhaustiveCheck = contentBlockType;
                    throw new Error(
                      `Unsupported content block type: ${_exhaustiveCheck}`
                    );
                  }
                }
              }
              case "content_block_stop": {
                if (contentBlocks[value.index] != null) {
                  const contentBlock = contentBlocks[value.index];
                  switch (contentBlock.type) {
                    case "text": {
                      controller.enqueue({
                        type: "text-end",
                        id: String(value.index)
                      });
                      break;
                    }
                    case "reasoning": {
                      controller.enqueue({
                        type: "reasoning-end",
                        id: String(value.index)
                      });
                      break;
                    }
                    case "tool-call":
                      if (!usesJsonResponseTool) {
                        controller.enqueue({
                          type: "tool-input-end",
                          id: contentBlock.toolCallId
                        });
                        controller.enqueue(contentBlock);
                      }
                      break;
                  }
                  delete contentBlocks[value.index];
                }
                blockType = void 0;
                return;
              }
              case "content_block_delta": {
                const deltaType = value.delta.type;
                switch (deltaType) {
                  case "text_delta": {
                    if (usesJsonResponseTool) {
                      return;
                    }
                    controller.enqueue({
                      type: "text-delta",
                      id: String(value.index),
                      delta: value.delta.text
                    });
                    return;
                  }
                  case "thinking_delta": {
                    controller.enqueue({
                      type: "reasoning-delta",
                      id: String(value.index),
                      delta: value.delta.thinking
                    });
                    return;
                  }
                  case "signature_delta": {
                    if (blockType === "thinking") {
                      controller.enqueue({
                        type: "reasoning-delta",
                        id: String(value.index),
                        delta: "",
                        providerMetadata: {
                          anthropic: {
                            signature: value.delta.signature
                          }
                        }
                      });
                    }
                    return;
                  }
                  case "input_json_delta": {
                    const contentBlock = contentBlocks[value.index];
                    const delta = value.delta.partial_json;
                    if (usesJsonResponseTool) {
                      if ((contentBlock == null ? void 0 : contentBlock.type) !== "text") {
                        return;
                      }
                      controller.enqueue({
                        type: "text-delta",
                        id: String(value.index),
                        delta
                      });
                    } else {
                      if ((contentBlock == null ? void 0 : contentBlock.type) !== "tool-call") {
                        return;
                      }
                      controller.enqueue({
                        type: "tool-input-delta",
                        id: contentBlock.toolCallId,
                        delta
                      });
                      contentBlock.input += delta;
                    }
                    return;
                  }
                  case "citations_delta": {
                    const citation = value.delta.citation;
                    processCitation(
                      citation,
                      citationDocuments,
                      generateId3,
                      (source) => controller.enqueue(source)
                    );
                    return;
                  }
                  default: {
                    const _exhaustiveCheck = deltaType;
                    throw new Error(
                      `Unsupported delta type: ${_exhaustiveCheck}`
                    );
                  }
                }
              }
              case "message_start": {
                usage.inputTokens = value.message.usage.input_tokens;
                usage.cachedInputTokens = (_b = value.message.usage.cache_read_input_tokens) != null ? _b : void 0;
                providerMetadata = {
                  anthropic: {
                    usage: value.message.usage,
                    cacheCreationInputTokens: (_c = value.message.usage.cache_creation_input_tokens) != null ? _c : null
                  }
                };
                controller.enqueue({
                  type: "response-metadata",
                  id: (_d = value.message.id) != null ? _d : void 0,
                  modelId: (_e = value.message.model) != null ? _e : void 0
                });
                return;
              }
              case "message_delta": {
                usage.outputTokens = value.usage.output_tokens;
                usage.totalTokens = ((_f = usage.inputTokens) != null ? _f : 0) + ((_g = value.usage.output_tokens) != null ? _g : 0);
                finishReason = mapAnthropicStopReason({
                  finishReason: value.delta.stop_reason,
                  isJsonResponseFromTool: usesJsonResponseTool
                });
                return;
              }
              case "message_stop": {
                controller.enqueue({
                  type: "finish",
                  finishReason,
                  usage,
                  providerMetadata
                });
                return;
              }
              case "error": {
                controller.enqueue({ type: "error", error: value.error });
                return;
              }
              default: {
                const _exhaustiveCheck = value;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          }
        })
      ),
      request: { body },
      response: { headers: responseHeaders }
    };
  }
};
var anthropicMessagesResponseSchema = z.object({
  type: z.literal("message"),
  id: z.string().nullish(),
  model: z.string().nullish(),
  content: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("text"),
        text: z.string(),
        citations: z.array(citationSchema).optional()
      }),
      z.object({
        type: z.literal("thinking"),
        thinking: z.string(),
        signature: z.string()
      }),
      z.object({
        type: z.literal("redacted_thinking"),
        data: z.string()
      }),
      z.object({
        type: z.literal("tool_use"),
        id: z.string(),
        name: z.string(),
        input: z.unknown()
      }),
      z.object({
        type: z.literal("server_tool_use"),
        id: z.string(),
        name: z.string(),
        input: z.record(z.string(), z.unknown()).nullish()
      }),
      z.object({
        type: z.literal("web_search_tool_result"),
        tool_use_id: z.string(),
        content: z.union([
          z.array(
            z.object({
              type: z.literal("web_search_result"),
              url: z.string(),
              title: z.string(),
              encrypted_content: z.string(),
              page_age: z.string().nullish()
            })
          ),
          z.object({
            type: z.literal("web_search_tool_result_error"),
            error_code: z.string()
          })
        ])
      }),
      z.object({
        type: z.literal("code_execution_tool_result"),
        tool_use_id: z.string(),
        content: z.union([
          z.object({
            type: z.literal("code_execution_result"),
            stdout: z.string(),
            stderr: z.string(),
            return_code: z.number()
          }),
          z.object({
            type: z.literal("code_execution_tool_result_error"),
            error_code: z.string()
          })
        ])
      })
    ])
  ),
  stop_reason: z.string().nullish(),
  usage: z.looseObject({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_creation_input_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish()
  })
});
var anthropicMessagesChunkSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message_start"),
    message: z.object({
      id: z.string().nullish(),
      model: z.string().nullish(),
      usage: z.looseObject({
        input_tokens: z.number(),
        output_tokens: z.number(),
        cache_creation_input_tokens: z.number().nullish(),
        cache_read_input_tokens: z.number().nullish()
      })
    })
  }),
  z.object({
    type: z.literal("content_block_start"),
    index: z.number(),
    content_block: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("text"),
        text: z.string()
      }),
      z.object({
        type: z.literal("thinking"),
        thinking: z.string()
      }),
      z.object({
        type: z.literal("tool_use"),
        id: z.string(),
        name: z.string()
      }),
      z.object({
        type: z.literal("redacted_thinking"),
        data: z.string()
      }),
      z.object({
        type: z.literal("server_tool_use"),
        id: z.string(),
        name: z.string(),
        input: z.record(z.string(), z.unknown()).nullish()
      }),
      z.object({
        type: z.literal("web_search_tool_result"),
        tool_use_id: z.string(),
        content: z.union([
          z.array(
            z.object({
              type: z.literal("web_search_result"),
              url: z.string(),
              title: z.string(),
              encrypted_content: z.string(),
              page_age: z.string().nullish()
            })
          ),
          z.object({
            type: z.literal("web_search_tool_result_error"),
            error_code: z.string()
          })
        ])
      }),
      z.object({
        type: z.literal("code_execution_tool_result"),
        tool_use_id: z.string(),
        content: z.union([
          z.object({
            type: z.literal("code_execution_result"),
            stdout: z.string(),
            stderr: z.string(),
            return_code: z.number()
          }),
          z.object({
            type: z.literal("code_execution_tool_result_error"),
            error_code: z.string()
          })
        ])
      })
    ])
  }),
  z.object({
    type: z.literal("content_block_delta"),
    index: z.number(),
    delta: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("input_json_delta"),
        partial_json: z.string()
      }),
      z.object({
        type: z.literal("text_delta"),
        text: z.string()
      }),
      z.object({
        type: z.literal("thinking_delta"),
        thinking: z.string()
      }),
      z.object({
        type: z.literal("signature_delta"),
        signature: z.string()
      }),
      z.object({
        type: z.literal("citations_delta"),
        citation: citationSchema
      })
    ])
  }),
  z.object({
    type: z.literal("content_block_stop"),
    index: z.number()
  }),
  z.object({
    type: z.literal("error"),
    error: z.object({
      type: z.string(),
      message: z.string()
    })
  }),
  z.object({
    type: z.literal("message_delta"),
    delta: z.object({ stop_reason: z.string().nullish() }),
    usage: z.object({ output_tokens: z.number() })
  }),
  z.object({
    type: z.literal("message_stop")
  }),
  z.object({
    type: z.literal("ping")
  })
]);
var anthropicReasoningMetadataSchema = z.object({
  signature: z.string().optional(),
  redactedData: z.string().optional()
});
var bash_20241022 = createProviderDefinedToolFactory({
  id: "anthropic.bash_20241022",
  name: "bash",
  inputSchema: z6__default.object({
    command: z6__default.string(),
    restart: z6__default.boolean().optional()
  })
});
var bash_20250124 = createProviderDefinedToolFactory({
  id: "anthropic.bash_20250124",
  name: "bash",
  inputSchema: z6__default.object({
    command: z6__default.string(),
    restart: z6__default.boolean().optional()
  })
});
var computer_20241022 = createProviderDefinedToolFactory({
  id: "anthropic.computer_20241022",
  name: "computer",
  inputSchema: z.object({
    action: z.enum([
      "key",
      "type",
      "mouse_move",
      "left_click",
      "left_click_drag",
      "right_click",
      "middle_click",
      "double_click",
      "screenshot",
      "cursor_position"
    ]),
    coordinate: z.array(z.number().int()).optional(),
    text: z.string().optional()
  })
});
var computer_20250124 = createProviderDefinedToolFactory({
  id: "anthropic.computer_20250124",
  name: "computer",
  inputSchema: z.object({
    action: z.enum([
      "key",
      "hold_key",
      "type",
      "cursor_position",
      "mouse_move",
      "left_mouse_down",
      "left_mouse_up",
      "left_click",
      "left_click_drag",
      "right_click",
      "middle_click",
      "double_click",
      "triple_click",
      "scroll",
      "wait",
      "screenshot"
    ]),
    coordinate: z.tuple([z.number().int(), z.number().int()]).optional(),
    duration: z.number().optional(),
    scroll_amount: z.number().optional(),
    scroll_direction: z.enum(["up", "down", "left", "right"]).optional(),
    start_coordinate: z.tuple([z.number().int(), z.number().int()]).optional(),
    text: z.string().optional()
  })
});
var textEditor_20241022 = createProviderDefinedToolFactory({
  id: "anthropic.text_editor_20241022",
  name: "str_replace_editor",
  inputSchema: z.object({
    command: z.enum(["view", "create", "str_replace", "insert", "undo_edit"]),
    path: z.string(),
    file_text: z.string().optional(),
    insert_line: z.number().int().optional(),
    new_str: z.string().optional(),
    old_str: z.string().optional(),
    view_range: z.array(z.number().int()).optional()
  })
});
var textEditor_20250124 = createProviderDefinedToolFactory({
  id: "anthropic.text_editor_20250124",
  name: "str_replace_editor",
  inputSchema: z.object({
    command: z.enum(["view", "create", "str_replace", "insert", "undo_edit"]),
    path: z.string(),
    file_text: z.string().optional(),
    insert_line: z.number().int().optional(),
    new_str: z.string().optional(),
    old_str: z.string().optional(),
    view_range: z.array(z.number().int()).optional()
  })
});
var textEditor_20250429 = createProviderDefinedToolFactory({
  id: "anthropic.text_editor_20250429",
  name: "str_replace_based_edit_tool",
  inputSchema: z.object({
    command: z.enum(["view", "create", "str_replace", "insert"]),
    path: z.string(),
    file_text: z.string().optional(),
    insert_line: z.number().int().optional(),
    new_str: z.string().optional(),
    old_str: z.string().optional(),
    view_range: z.array(z.number().int()).optional()
  })
});
var anthropicTools = {
  /**
   * Creates a tool for running a bash command. Must have name "bash".
   *
   * Image results are supported.
   *
   * @param execute - The function to execute the tool. Optional.
   */
  bash_20241022,
  /**
   * Creates a tool for running a bash command. Must have name "bash".
   *
   * Image results are supported.
   *
   * @param execute - The function to execute the tool. Optional.
   */
  bash_20250124,
  /**
   * Creates a tool for editing text. Must have name "str_replace_editor".
   */
  textEditor_20241022,
  /**
   * Creates a tool for editing text. Must have name "str_replace_editor".
   */
  textEditor_20250124,
  /**
   * Creates a tool for editing text. Must have name "str_replace_based_edit_tool".
   * Note: This version does not support the "undo_edit" command.
   */
  textEditor_20250429,
  /**
   * Creates a tool for executing actions on a computer. Must have name "computer".
   *
   * Image results are supported.
   *
   * @param displayWidthPx - The width of the display being controlled by the model in pixels.
   * @param displayHeightPx - The height of the display being controlled by the model in pixels.
   * @param displayNumber - The display number to control (only relevant for X11 environments). If specified, the tool will be provided a display number in the tool definition.
   */
  computer_20241022,
  /**
   * Creates a tool for executing actions on a computer. Must have name "computer".
   *
   * Image results are supported.
   *
   * @param displayWidthPx - The width of the display being controlled by the model in pixels.
   * @param displayHeightPx - The height of the display being controlled by the model in pixels.
   * @param displayNumber - The display number to control (only relevant for X11 environments). If specified, the tool will be provided a display number in the tool definition.
   * @param execute - The function to execute the tool. Optional.
   */
  computer_20250124,
  /**
   * Creates a web search tool that gives Claude direct access to real-time web content.
   * Must have name "web_search".
   *
   * @param maxUses - Maximum number of web searches Claude can perform during the conversation.
   * @param allowedDomains - Optional list of domains that Claude is allowed to search.
   * @param blockedDomains - Optional list of domains that Claude should avoid when searching.
   * @param userLocation - Optional user location information to provide geographically relevant search results.
   */
  webSearch_20250305,
  /**
   * Creates a tool for executing Python code. Must have name "code_execution".
   */
  codeExecution_20250522
};
function createAnthropic(options = {}) {
  var _a;
  const baseURL = (_a = withoutTrailingSlash(options.baseURL)) != null ? _a : "https://api.anthropic.com/v1";
  const getHeaders = () => ({
    "anthropic-version": "2023-06-01",
    "x-api-key": loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "ANTHROPIC_API_KEY",
      description: "Anthropic"
    }),
    ...options.headers
  });
  const createChatModel = (modelId) => {
    var _a2;
    return new AnthropicMessagesLanguageModel(modelId, {
      provider: "anthropic.messages",
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: (_a2 = options.generateId) != null ? _a2 : generateId,
      supportedUrls: () => ({
        "image/*": [/^https?:\/\/.*$/]
      })
    });
  };
  const provider = function(modelId) {
    if (new.target) {
      throw new Error(
        "The Anthropic model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId);
  };
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.messages = createChatModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  provider.imageModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "imageModel" });
  };
  provider.tools = anthropicTools;
  return provider;
}
var anthropic = createAnthropic();

export { anthropic, createAnthropic };
