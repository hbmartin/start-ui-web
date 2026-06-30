import {
  handleRequest,
  RejectUpload,
  route,
  type Router,
} from '@better-upload/server';
import { custom } from '@better-upload/server/clients';
import { mapValues } from 'remeda';

import type {
  ObjectStoragePort,
  ObjectUploadRequestHandler,
  ObjectUploadRouteDefinition,
} from '@/modules/kernel/application/ports/object-storage';
import { getStorageConfig } from '@/modules/kernel/infrastructure/config/storage';

const createUploadClient = () => {
  const config = getStorageConfig();
  return custom({
    host: config.host,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    secure: config.secure,
  });
};

const toBetterUploadRoute = (definition: ObjectUploadRouteDefinition) =>
  route({
    fileTypes: definition.fileTypes,
    maxFileSize: definition.maxFileSize,
    onBeforeUpload: async ({ req, file }) => {
      const prepared = await definition.prepare({
        headers: req.headers,
        fileType: file.type,
      });
      // Map the provider-neutral rejection to better-upload's mechanism. This
      // adapter is the single seam that speaks the SDK's exception dialect;
      // genuine system failures reject the promise above and propagate.
      if (prepared.isError()) {
        throw new RejectUpload(prepared.getError().messageKey);
      }
      const objectInfo = prepared.get();
      return {
        objectInfo: {
          key: objectInfo.objectKey,
          ...(objectInfo.cacheControl
            ? { cacheControl: objectInfo.cacheControl }
            : {}),
        },
      };
    },
  });

/**
 * better-upload (+ S3-compatible) implementation of {@link ObjectStoragePort}.
 * This adapter is the ONLY place allowed to import `@better-upload/server`.
 */
export class BetterUploadObjectStorage implements ObjectStoragePort {
  createUploadRequestHandler(
    routes: Record<string, ObjectUploadRouteDefinition>
  ): ObjectUploadRequestHandler {
    const router = {
      client: createUploadClient(),
      bucketName: getStorageConfig().bucketName,
      routes: mapValues(routes, toBetterUploadRoute),
    } satisfies Router;
    return (request) => handleRequest(request, router);
  }
}
