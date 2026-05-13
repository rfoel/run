import type { Writable } from "node:stream";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";

declare global {
  namespace awslambda {
    type ResponseStream = Writable & {
      setContentType(type: string): void;
    };

    function streamifyResponse<E = APIGatewayProxyEventV2>(
      handler: (
        event: E,
        responseStream: ResponseStream,
        context: Context,
      ) => Promise<void>,
    ): (event: E, context: Context) => Promise<void>;

    namespace HttpResponseStream {
      function from(
        stream: ResponseStream,
        metadata: {
          statusCode: number;
          headers?: Record<string, string>;
        },
      ): ResponseStream;
    }
  }
}

export {};
