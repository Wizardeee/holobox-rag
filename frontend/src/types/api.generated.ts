// GENERATED FILE — do not edit. Run: npm run generate:api-types
export interface paths {
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_api_v1_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Documents */
        get: operations["list_documents_api_v1_documents_get"];
        put?: never;
        /** Upload Document */
        post: operations["upload_document_api_v1_documents_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/documents/{document_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Document */
        get: operations["get_document_api_v1_documents__document_id__get"];
        put?: never;
        post?: never;
        /** Delete Document */
        delete: operations["delete_document_api_v1_documents__document_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Query */
        post: operations["query_api_v1_query_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/transcribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Transcribe Audio */
        post: operations["transcribe_audio_api_v1_transcribe_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/synthesize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Synthesize */
        post: operations["synthesize_api_v1_synthesize_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/config/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Capabilities */
        get: operations["capabilities_api_v1_config_capabilities_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/conversations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Conversations */
        get: operations["list_conversations_api_v1_conversations_get"];
        put?: never;
        /** Create Conversation */
        post: operations["create_conversation_api_v1_conversations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/conversations/{conversation_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Conversation */
        get: operations["get_conversation_api_v1_conversations__conversation_id__get"];
        put?: never;
        post?: never;
        /** Delete Conversation */
        delete: operations["delete_conversation_api_v1_conversations__conversation_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** Body_transcribe_audio_api_v1_transcribe_post */
        Body_transcribe_audio_api_v1_transcribe_post: {
            /**
             * Audio
             * Format: binary
             */
            audio: string;
            /** Language */
            language?: string | null;
        };
        /** Body_upload_document_api_v1_documents_post */
        Body_upload_document_api_v1_documents_post: {
            /**
             * File
             * Format: binary
             */
            file: string;
            /** @default user */
            scope: components["schemas"]["Scope"];
        };
        /** CapabilitiesResponse */
        CapabilitiesResponse: {
            /** Providers */
            providers: string[];
            /** Active Provider */
            active_provider: string;
            /** Llm Configured */
            llm_configured: boolean;
            /** Embedding Model */
            embedding_model: string;
            /** Stt Models */
            stt_models: string[];
            /** Tts Voices */
            tts_voices: string[];
            /** Voice Input Enabled */
            voice_input_enabled: boolean;
            /** Voice Output Enabled */
            voice_output_enabled: boolean;
        };
        /** Conversation */
        Conversation: {
            /** Id */
            id: string;
            /** Owner Id */
            owner_id: string;
            /** Title */
            title: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
            /** Messages */
            messages: components["schemas"]["MessageInfo"][];
        };
        /** ConversationCreate */
        ConversationCreate: {
            /**
             * Owner Id
             * @default local-user
             */
            owner_id: string;
            /** Title */
            title?: string | null;
        };
        /** ConversationSummary */
        ConversationSummary: {
            /** Id */
            id: string;
            /** Title */
            title: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
            /** Message Count */
            message_count: number;
        };
        /** DeletedResponse */
        DeletedResponse: {
            /** Deleted */
            deleted: boolean;
        };
        /** DocumentInfo */
        DocumentInfo: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            scope: components["schemas"]["Scope"];
            /** Owner Id */
            owner_id: string;
            status: components["schemas"]["DocumentStatus"];
            /** Size Bytes */
            size_bytes: number;
            /** Sha256 */
            sha256: string;
            /** Page Count */
            page_count?: number | null;
            /**
             * Chunk Count
             * @default 0
             */
            chunk_count: number;
            /** Error */
            error?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * DocumentStatus
         * @enum {string}
         */
        DocumentStatus: "processing" | "ready" | "failed";
        /**
         * GenerationMode
         * @enum {string}
         */
        GenerationMode: "mock" | "live" | "unavailable";
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** HealthResponse */
        HealthResponse: {
            /** Status */
            status: string;
            /** Version */
            version: string;
            /** Capabilities */
            capabilities: Record<string, never>;
        };
        /** MessageInfo */
        MessageInfo: {
            /** Id */
            id: string;
            /** Role */
            role: string;
            /** Content */
            content: string;
            /** Sources */
            sources?: components["schemas"]["SourceReference"][];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** QueryRequest */
        QueryRequest: {
            /** Question */
            question: string;
            /**
             * Owner Id
             * @default local-user
             */
            owner_id: string;
            /** Conversation Id */
            conversation_id?: string | null;
            /** Top K */
            top_k?: number | null;
            /**
             * Include Sources
             * @default true
             */
            include_sources: boolean;
        };
        /** QueryResponse */
        QueryResponse: {
            /** Answer */
            answer: string;
            /** Sources */
            sources: components["schemas"]["SourceReference"][];
            generation_mode: components["schemas"]["GenerationMode"];
            /** Conversation Id */
            conversation_id?: string | null;
            /** Retrieved Context Available */
            retrieved_context_available: boolean;
            /** Warning */
            warning?: string | null;
        };
        /**
         * Scope
         * @enum {string}
         */
        Scope: "shared" | "user";
        /** SourceReference */
        SourceReference: {
            /** Document Id */
            document_id: string;
            /** Document Name */
            document_name: string;
            /** Page Number */
            page_number?: number | null;
            /** Excerpt */
            excerpt: string;
            /** Score */
            score: number;
        };
        /** SynthesisRequest */
        SynthesisRequest: {
            /** Text */
            text: string;
            /** Voice */
            voice?: string | null;
        };
        /** TranscriptionResponse */
        TranscriptionResponse: {
            /** Text */
            text: string;
            /** Language */
            language?: string | null;
            /** Duration Seconds */
            duration_seconds?: number | null;
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    health_api_v1_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    list_documents_api_v1_documents_get: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentInfo"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_document_api_v1_documents_post: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_document_api_v1_documents_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentInfo"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_document_api_v1_documents__document_id__get: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path: {
                document_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentInfo"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_document_api_v1_documents__document_id__delete: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path: {
                document_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeletedResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    query_api_v1_query_post: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QueryRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QueryResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    transcribe_audio_api_v1_transcribe_post: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_transcribe_audio_api_v1_transcribe_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TranscriptionResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    synthesize_api_v1_synthesize_post: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SynthesisRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    capabilities_api_v1_config_capabilities_get: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CapabilitiesResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_conversations_api_v1_conversations_get: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConversationSummary"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_conversation_api_v1_conversations_post: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConversationCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Conversation"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_conversation_api_v1_conversations__conversation_id__get: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path: {
                conversation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Conversation"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_conversation_api_v1_conversations__conversation_id__delete: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
                "X-User-Id"?: string;
            };
            path: {
                conversation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeletedResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
