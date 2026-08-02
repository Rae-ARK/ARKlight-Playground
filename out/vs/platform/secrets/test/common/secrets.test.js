import assert from "assert";
import * as sinon from "sinon";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { KnownStorageProvider } from "../../../encryption/common/encryptionService.js";
import { NullLogService } from "../../../log/common/log.js";
import { BaseSecretStorageService, CROSS_APP_SHARED_SECRET_KEYS, secretStorageKey } from "../../common/secrets.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../storage/common/storage.js";
class TestEncryptionService {
  constructor() {
    this.encryptedPrefix = "encrypted+";
  }
  // prefix to simulate encryption
  setUsePlainTextEncryption() {
    return Promise.resolve();
  }
  getKeyStorageProvider() {
    return Promise.resolve(KnownStorageProvider.basicText);
  }
  encrypt(value) {
    return Promise.resolve(this.encryptedPrefix + value);
  }
  decrypt(value) {
    return Promise.resolve(value.substring(this.encryptedPrefix.length));
  }
  isEncryptionAvailable() {
    return Promise.resolve(true);
  }
}
class TestFailingEncryptionService extends TestEncryptionService {
  constructor() {
    super(...arguments);
    this.decryptCalls = 0;
  }
  decrypt(_value) {
    this.decryptCalls++;
    return Promise.reject(new Error("Cannot decrypt stale secret"));
  }
}
class TestNoEncryptionService {
  setUsePlainTextEncryption() {
    throw new Error("Method not implemented.");
  }
  getKeyStorageProvider() {
    throw new Error("Method not implemented.");
  }
  encrypt(value) {
    throw new Error("Method not implemented.");
  }
  decrypt(value) {
    throw new Error("Method not implemented.");
  }
  isEncryptionAvailable() {
    return Promise.resolve(false);
  }
}
suite("secrets", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("BaseSecretStorageService useInMemoryStorage=true", () => {
    let service;
    let spyEncryptionService;
    let sandbox;
    setup(() => {
      sandbox = sinon.createSandbox();
      spyEncryptionService = sandbox.spy(new TestEncryptionService());
      service = store.add(new BaseSecretStorageService(
        true,
        store.add(new InMemoryStorageService()),
        spyEncryptionService,
        store.add(new NullLogService())
      ));
    });
    teardown(() => {
      sandbox.restore();
    });
    test("type", async () => {
      assert.strictEqual(service.type, "unknown");
      await service.set("my-secret", "my-secret-value");
      assert.strictEqual(service.type, "in-memory");
    });
    test("set and get", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      const result = await service.get(key);
      assert.strictEqual(result, value);
      assert.strictEqual(spyEncryptionService.encrypt.callCount, 0);
      assert.strictEqual(spyEncryptionService.decrypt.callCount, 0);
    });
    test("delete", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      await service.delete(key);
      const result = await service.get(key);
      assert.strictEqual(result, void 0);
    });
    test("onDidChangeSecret", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      let eventFired = false;
      store.add(service.onDidChangeSecret((changedKey) => {
        assert.strictEqual(changedKey, key);
        eventFired = true;
      }));
      await service.set(key, value);
      assert.strictEqual(eventFired, true);
    });
  });
  suite("BaseSecretStorageService useInMemoryStorage=false", () => {
    let service;
    let spyEncryptionService;
    let sandbox;
    setup(() => {
      sandbox = sinon.createSandbox();
      spyEncryptionService = sandbox.spy(new TestEncryptionService());
      service = store.add(
        new BaseSecretStorageService(
          false,
          store.add(new InMemoryStorageService()),
          spyEncryptionService,
          store.add(new NullLogService())
        )
      );
    });
    teardown(() => {
      sandbox.restore();
    });
    test("type", async () => {
      assert.strictEqual(service.type, "unknown");
      await service.set("my-secret", "my-secret-value");
      assert.strictEqual(service.type, "persisted");
    });
    test("set and get", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      const result = await service.get(key);
      assert.strictEqual(result, value);
      assert.strictEqual(spyEncryptionService.encrypt.callCount, 1);
      assert.strictEqual(spyEncryptionService.decrypt.callCount, 1);
    });
    test("delete", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      await service.delete(key);
      const result = await service.get(key);
      assert.strictEqual(result, void 0);
    });
    test("get removes stale persisted secret when decryption fails", async () => {
      const key = "my-secret";
      const fullKey = secretStorageKey(key);
      const storageService = store.add(new InMemoryStorageService());
      const encryptionService = new TestFailingEncryptionService();
      const failingService = store.add(
        new BaseSecretStorageService(
          false,
          storageService,
          encryptionService,
          store.add(new NullLogService())
        )
      );
      storageService.store(fullKey, "encrypted+my-secret-value", StorageScope.APPLICATION, StorageTarget.MACHINE);
      assert.strictEqual(await failingService.get(key), void 0);
      assert.strictEqual(encryptionService.decryptCalls, 1);
      assert.strictEqual(storageService.get(fullKey, StorageScope.APPLICATION), void 0);
      assert.strictEqual(await failingService.get(key), void 0);
      assert.strictEqual(encryptionService.decryptCalls, 1);
    });
    test("onDidChangeSecret", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      let eventFired = false;
      store.add(service.onDidChangeSecret((changedKey) => {
        assert.strictEqual(changedKey, key);
        eventFired = true;
      }));
      await service.set(key, value);
      assert.strictEqual(eventFired, true);
    });
  });
  suite("BaseSecretStorageService useInMemoryStorage=false, encryption not available", () => {
    let service;
    let spyNoEncryptionService;
    let sandbox;
    setup(() => {
      sandbox = sinon.createSandbox();
      spyNoEncryptionService = sandbox.spy(new TestNoEncryptionService());
      service = store.add(
        new BaseSecretStorageService(
          false,
          store.add(new InMemoryStorageService()),
          spyNoEncryptionService,
          store.add(new NullLogService())
        )
      );
    });
    teardown(() => {
      sandbox.restore();
    });
    test("type", async () => {
      assert.strictEqual(service.type, "unknown");
      await service.set("my-secret", "my-secret-value");
      assert.strictEqual(service.type, "in-memory");
    });
    test("set and get", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      const result = await service.get(key);
      assert.strictEqual(result, value);
      assert.strictEqual(spyNoEncryptionService.encrypt.callCount, 0);
      assert.strictEqual(spyNoEncryptionService.decrypt.callCount, 0);
    });
  });
  suite("BaseSecretStorageService cross-app shared secrets", () => {
    class TestSharedSecretStorageService extends BaseSecretStorageService {
      useSharedStorage(key) {
        return CROSS_APP_SHARED_SECRET_KEYS.includes(key);
      }
    }
    let service;
    let storageService;
    let sandbox;
    setup(() => {
      sandbox = sinon.createSandbox();
      storageService = store.add(new InMemoryStorageService());
      service = store.add(
        new TestSharedSecretStorageService(
          false,
          storageService,
          sandbox.spy(new TestEncryptionService()),
          store.add(new NullLogService())
        )
      );
    });
    teardown(() => {
      sandbox.restore();
    });
    test("shared keys are stored and read from APPLICATION_SHARED", async () => {
      const sharedKey = CROSS_APP_SHARED_SECRET_KEYS[0];
      const value = "shared-secret-value";
      await service.set(sharedKey, value);
      const result = await service.get(sharedKey);
      assert.strictEqual(result, value);
      const regularKey = "regular-secret";
      await service.set(regularKey, "regular-value");
      assert.strictEqual(await service.get(regularKey), "regular-value");
    });
    test("onDidChangeSecret fires for APPLICATION_SHARED changes", async () => {
      const sharedKey = CROSS_APP_SHARED_SECRET_KEYS[0];
      let eventFired = false;
      store.add(service.onDidChangeSecret((changedKey) => {
        assert.strictEqual(changedKey, sharedKey);
        eventFired = true;
      }));
      await service.set(sharedKey, "value");
      assert.strictEqual(eventFired, true);
    });
    test("deleting a shared key removes it", async () => {
      const sharedKey = CROSS_APP_SHARED_SECRET_KEYS[0];
      await service.set(sharedKey, "value");
      assert.strictEqual(await service.get(sharedKey), "value");
      await service.delete(sharedKey);
      assert.strictEqual(await service.get(sharedKey), void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3NlY3JldHMvdGVzdC9jb21tb24vc2VjcmV0cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRW5jcnlwdGlvblNlcnZpY2UsIEtub3duU3RvcmFnZVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZW5jcnlwdGlvbi9jb21tb24vZW5jcnlwdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2UsIENST1NTX0FQUF9TSEFSRURfU0VDUkVUX0tFWVMsIHNlY3JldFN0b3JhZ2VLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vc2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcblxuY2xhc3MgVGVzdEVuY3J5cHRpb25TZXJ2aWNlIGltcGxlbWVudHMgSUVuY3J5cHRpb25TZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVuY3J5cHRlZFByZWZpeCA9ICdlbmNyeXB0ZWQrJzsgLy8gcHJlZml4IHRvIHNpbXVsYXRlIGVuY3J5cHRpb25cblx0c2V0VXNlUGxhaW5UZXh0RW5jcnlwdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblx0Z2V0S2V5U3RvcmFnZVByb3ZpZGVyKCk6IFByb21pc2U8S25vd25TdG9yYWdlUHJvdmlkZXI+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKEtub3duU3RvcmFnZVByb3ZpZGVyLmJhc2ljVGV4dCk7XG5cdH1cblx0ZW5jcnlwdCh2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuZW5jcnlwdGVkUHJlZml4ICsgdmFsdWUpO1xuXHR9XG5cdGRlY3J5cHQodmFsdWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh2YWx1ZS5zdWJzdHJpbmcodGhpcy5lbmNyeXB0ZWRQcmVmaXgubGVuZ3RoKSk7XG5cdH1cblx0aXNFbmNyeXB0aW9uQXZhaWxhYmxlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdEZhaWxpbmdFbmNyeXB0aW9uU2VydmljZSBleHRlbmRzIFRlc3RFbmNyeXB0aW9uU2VydmljZSB7XG5cdGRlY3J5cHRDYWxscyA9IDA7XG5cblx0b3ZlcnJpZGUgZGVjcnlwdChfdmFsdWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhpcy5kZWNyeXB0Q2FsbHMrKztcblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdDYW5ub3QgZGVjcnlwdCBzdGFsZSBzZWNyZXQnKSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdE5vRW5jcnlwdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJRW5jcnlwdGlvblNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHNldFVzZVBsYWluVGV4dEVuY3J5cHRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGdldEtleVN0b3JhZ2VQcm92aWRlcigpOiBQcm9taXNlPEtub3duU3RvcmFnZVByb3ZpZGVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGVuY3J5cHQodmFsdWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGRlY3J5cHQodmFsdWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGlzRW5jcnlwdGlvbkF2YWlsYWJsZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcblx0fVxufVxuXG5zdWl0ZSgnc2VjcmV0cycsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnQmFzZVNlY3JldFN0b3JhZ2VTZXJ2aWNlIHVzZUluTWVtb3J5U3RvcmFnZT10cnVlJywgKCkgPT4ge1xuXHRcdGxldCBzZXJ2aWNlOiBCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2U7XG5cdFx0bGV0IHNweUVuY3J5cHRpb25TZXJ2aWNlOiBzaW5vbi5TaW5vblNwaWVkSW5zdGFuY2U8VGVzdEVuY3J5cHRpb25TZXJ2aWNlPjtcblx0XHRsZXQgc2FuZGJveDogc2lub24uU2lub25TYW5kYm94O1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2FuZGJveCA9IHNpbm9uLmNyZWF0ZVNhbmRib3goKTtcblx0XHRcdHNweUVuY3J5cHRpb25TZXJ2aWNlID0gc2FuZGJveC5zcHkobmV3IFRlc3RFbmNyeXB0aW9uU2VydmljZSgpKTtcblx0XHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZShcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0c3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpLFxuXHRcdFx0XHRzcHlFbmNyeXB0aW9uU2VydmljZSxcblx0XHRcdFx0c3RvcmUuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKVxuXHRcdFx0KSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzYW5kYm94LnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3R5cGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50eXBlLCAndW5rbm93bicpO1xuXHRcdFx0Ly8gdHJpZ2dlciBsYXp5IGluaXRpYWxpemF0aW9uXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldCgnbXktc2VjcmV0JywgJ215LXNlY3JldC12YWx1ZScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50eXBlLCAnaW4tbWVtb3J5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXQgYW5kIGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9ICdteS1zZWNyZXQnO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAnbXktc2VjcmV0LXZhbHVlJztcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXQoa2V5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHZhbHVlKTtcblxuXHRcdFx0Ly8gQWRkaXRpb25hbGx5IGVuc3VyZSB0aGUgZW5jcnlwdGlvbnNlcnZpY2Ugd2FzIG5vdCB1c2VkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3B5RW5jcnlwdGlvblNlcnZpY2UuZW5jcnlwdC5jYWxsQ291bnQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNweUVuY3J5cHRpb25TZXJ2aWNlLmRlY3J5cHQuY2FsbENvdW50LCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9ICdteS1zZWNyZXQnO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAnbXktc2VjcmV0LXZhbHVlJztcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5kZWxldGUoa2V5KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0KGtleSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25EaWRDaGFuZ2VTZWNyZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSAnbXktc2VjcmV0Jztcblx0XHRcdGNvbnN0IHZhbHVlID0gJ215LXNlY3JldC12YWx1ZSc7XG5cdFx0XHRsZXQgZXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VTZWNyZXQoKGNoYW5nZWRLZXkpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWRLZXksIGtleSk7XG5cdFx0XHRcdGV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdFx0fSkpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRGaXJlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2UgdXNlSW5NZW1vcnlTdG9yYWdlPWZhbHNlJywgKCkgPT4ge1xuXHRcdGxldCBzZXJ2aWNlOiBCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2U7XG5cdFx0bGV0IHNweUVuY3J5cHRpb25TZXJ2aWNlOiBzaW5vbi5TaW5vblNwaWVkSW5zdGFuY2U8VGVzdEVuY3J5cHRpb25TZXJ2aWNlPjtcblx0XHRsZXQgc2FuZGJveDogc2lub24uU2lub25TYW5kYm94O1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2FuZGJveCA9IHNpbm9uLmNyZWF0ZVNhbmRib3goKTtcblx0XHRcdHNweUVuY3J5cHRpb25TZXJ2aWNlID0gc2FuZGJveC5zcHkobmV3IFRlc3RFbmNyeXB0aW9uU2VydmljZSgpKTtcblx0XHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZShcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdFx0c3B5RW5jcnlwdGlvblNlcnZpY2UsXG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSkpXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2FuZGJveC5yZXN0b3JlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0eXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudHlwZSwgJ3Vua25vd24nKTtcblx0XHRcdC8vIHRyaWdnZXIgbGF6eSBpbml0aWFsaXphdGlvblxuXHRcdFx0YXdhaXQgc2VydmljZS5zZXQoJ215LXNlY3JldCcsICdteS1zZWNyZXQtdmFsdWUnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudHlwZSwgJ3BlcnNpc3RlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0IGFuZCBnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSAnbXktc2VjcmV0Jztcblx0XHRcdGNvbnN0IHZhbHVlID0gJ215LXNlY3JldC12YWx1ZSc7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldChrZXksIHZhbHVlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0KGtleSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB2YWx1ZSk7XG5cblx0XHRcdC8vIEFkZGl0aW9uYWxseSBlbnN1cmUgdGhlIGVuY3J5cHRpb25zZXJ2aWNlIHdhcyBub3QgdXNlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNweUVuY3J5cHRpb25TZXJ2aWNlLmVuY3J5cHQuY2FsbENvdW50LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcHlFbmNyeXB0aW9uU2VydmljZS5kZWNyeXB0LmNhbGxDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSAnbXktc2VjcmV0Jztcblx0XHRcdGNvbnN0IHZhbHVlID0gJ215LXNlY3JldC12YWx1ZSc7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldChrZXksIHZhbHVlKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuZGVsZXRlKGtleSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldChrZXkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldCByZW1vdmVzIHN0YWxlIHBlcnNpc3RlZCBzZWNyZXQgd2hlbiBkZWNyeXB0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gJ215LXNlY3JldCc7XG5cdFx0XHRjb25zdCBmdWxsS2V5ID0gc2VjcmV0U3RvcmFnZUtleShrZXkpO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBlbmNyeXB0aW9uU2VydmljZSA9IG5ldyBUZXN0RmFpbGluZ0VuY3J5cHRpb25TZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBmYWlsaW5nU2VydmljZSA9IHN0b3JlLmFkZChuZXcgQmFzZVNlY3JldFN0b3JhZ2VTZXJ2aWNlKFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRcdGVuY3J5cHRpb25TZXJ2aWNlLFxuXHRcdFx0XHRzdG9yZS5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpKVxuXHRcdFx0KTtcblxuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoZnVsbEtleSwgJ2VuY3J5cHRlZCtteS1zZWNyZXQtdmFsdWUnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZmFpbGluZ1NlcnZpY2UuZ2V0KGtleSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5jcnlwdGlvblNlcnZpY2UuZGVjcnlwdENhbGxzLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yYWdlU2VydmljZS5nZXQoZnVsbEtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGZhaWxpbmdTZXJ2aWNlLmdldChrZXkpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuY3J5cHRpb25TZXJ2aWNlLmRlY3J5cHRDYWxscywgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbkRpZENoYW5nZVNlY3JldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9ICdteS1zZWNyZXQnO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAnbXktc2VjcmV0LXZhbHVlJztcblx0XHRcdGxldCBldmVudEZpcmVkID0gZmFsc2U7XG5cdFx0XHRzdG9yZS5hZGQoc2VydmljZS5vbkRpZENoYW5nZVNlY3JldCgoY2hhbmdlZEtleSkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZEtleSwga2V5KTtcblx0XHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldChrZXksIHZhbHVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEZpcmVkLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0Jhc2VTZWNyZXRTdG9yYWdlU2VydmljZSB1c2VJbk1lbW9yeVN0b3JhZ2U9ZmFsc2UsIGVuY3J5cHRpb24gbm90IGF2YWlsYWJsZScsICgpID0+IHtcblx0XHRsZXQgc2VydmljZTogQmFzZVNlY3JldFN0b3JhZ2VTZXJ2aWNlO1xuXHRcdGxldCBzcHlOb0VuY3J5cHRpb25TZXJ2aWNlOiBzaW5vbi5TaW5vblNwaWVkSW5zdGFuY2U8VGVzdEVuY3J5cHRpb25TZXJ2aWNlPjtcblx0XHRsZXQgc2FuZGJveDogc2lub24uU2lub25TYW5kYm94O1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2FuZGJveCA9IHNpbm9uLmNyZWF0ZVNhbmRib3goKTtcblx0XHRcdHNweU5vRW5jcnlwdGlvblNlcnZpY2UgPSBzYW5kYm94LnNweShuZXcgVGVzdE5vRW5jcnlwdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2UoXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSksXG5cdFx0XHRcdHNweU5vRW5jcnlwdGlvblNlcnZpY2UsXG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSkpXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2FuZGJveC5yZXN0b3JlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0eXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudHlwZSwgJ3Vua25vd24nKTtcblx0XHRcdC8vIHRyaWdnZXIgbGF6eSBpbml0aWFsaXphdGlvblxuXHRcdFx0YXdhaXQgc2VydmljZS5zZXQoJ215LXNlY3JldCcsICdteS1zZWNyZXQtdmFsdWUnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudHlwZSwgJ2luLW1lbW9yeScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0IGFuZCBnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSAnbXktc2VjcmV0Jztcblx0XHRcdGNvbnN0IHZhbHVlID0gJ215LXNlY3JldC12YWx1ZSc7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldChrZXksIHZhbHVlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0KGtleSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB2YWx1ZSk7XG5cblx0XHRcdC8vIEFkZGl0aW9uYWxseSBlbnN1cmUgdGhlIGVuY3J5cHRpb25zZXJ2aWNlIHdhcyBub3QgdXNlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNweU5vRW5jcnlwdGlvblNlcnZpY2UuZW5jcnlwdC5jYWxsQ291bnQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNweU5vRW5jcnlwdGlvblNlcnZpY2UuZGVjcnlwdC5jYWxsQ291bnQsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQmFzZVNlY3JldFN0b3JhZ2VTZXJ2aWNlIGNyb3NzLWFwcCBzaGFyZWQgc2VjcmV0cycsICgpID0+IHtcblxuXHRcdGNsYXNzIFRlc3RTaGFyZWRTZWNyZXRTdG9yYWdlU2VydmljZSBleHRlbmRzIEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZSB7XG5cdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXNlU2hhcmVkU3RvcmFnZShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gQ1JPU1NfQVBQX1NIQVJFRF9TRUNSRVRfS0VZUy5pbmNsdWRlcyhrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBzZXJ2aWNlOiBCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2U7XG5cdFx0bGV0IHN0b3JhZ2VTZXJ2aWNlOiBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlO1xuXHRcdGxldCBzYW5kYm94OiBzaW5vbi5TaW5vblNhbmRib3g7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzYW5kYm94ID0gc2lub24uY3JlYXRlU2FuZGJveCgpO1xuXHRcdFx0c3RvcmFnZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U2hhcmVkU2VjcmV0U3RvcmFnZVNlcnZpY2UoXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdFx0c2FuZGJveC5zcHkobmV3IFRlc3RFbmNyeXB0aW9uU2VydmljZSgpKSxcblx0XHRcdFx0c3RvcmUuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSlcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzYW5kYm94LnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NoYXJlZCBrZXlzIGFyZSBzdG9yZWQgYW5kIHJlYWQgZnJvbSBBUFBMSUNBVElPTl9TSEFSRUQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzaGFyZWRLZXkgPSBDUk9TU19BUFBfU0hBUkVEX1NFQ1JFVF9LRVlTWzBdO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAnc2hhcmVkLXNlY3JldC12YWx1ZSc7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldChzaGFyZWRLZXksIHZhbHVlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0KHNoYXJlZEtleSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB2YWx1ZSk7XG5cblx0XHRcdC8vIE5vbi1zaGFyZWQga2V5IHNob3VsZCBzdGlsbCB3b3JrIHZpYSBBUFBMSUNBVElPTiBzY29wZVxuXHRcdFx0Y29uc3QgcmVndWxhcktleSA9ICdyZWd1bGFyLXNlY3JldCc7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldChyZWd1bGFyS2V5LCAncmVndWxhci12YWx1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZ2V0KHJlZ3VsYXJLZXkpLCAncmVndWxhci12YWx1ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25EaWRDaGFuZ2VTZWNyZXQgZmlyZXMgZm9yIEFQUExJQ0FUSU9OX1NIQVJFRCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2hhcmVkS2V5ID0gQ1JPU1NfQVBQX1NIQVJFRF9TRUNSRVRfS0VZU1swXTtcblx0XHRcdGxldCBldmVudEZpcmVkID0gZmFsc2U7XG5cdFx0XHRzdG9yZS5hZGQoc2VydmljZS5vbkRpZENoYW5nZVNlY3JldChjaGFuZ2VkS2V5ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWRLZXksIHNoYXJlZEtleSk7XG5cdFx0XHRcdGV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdFx0fSkpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5zZXQoc2hhcmVkS2V5LCAndmFsdWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEZpcmVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0aW5nIGEgc2hhcmVkIGtleSByZW1vdmVzIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2hhcmVkS2V5ID0gQ1JPU1NfQVBQX1NIQVJFRF9TRUNSRVRfS0VZU1swXTtcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KHNoYXJlZEtleSwgJ3ZhbHVlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5nZXQoc2hhcmVkS2V5KSwgJ3ZhbHVlJyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZShzaGFyZWRLZXkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZ2V0KHNoYXJlZEtleSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsK0NBQStDO0FBQ3hELFNBQTZCLDRCQUE0QjtBQUN6RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQiw4QkFBOEIsd0JBQXdCO0FBQ3pGLFNBQVMsd0JBQXdCLGNBQWMscUJBQXFCO0FBRXBFLE1BQU0sc0JBQW9EO0FBQUEsRUFBMUQ7QUFFQyxTQUFRLGtCQUFrQjtBQUFBO0FBQUE7QUFBQSxFQUMxQiw0QkFBMkM7QUFDMUMsV0FBTyxRQUFRLFFBQVE7QUFBQSxFQUN4QjtBQUFBLEVBQ0Esd0JBQXVEO0FBQ3RELFdBQU8sUUFBUSxRQUFRLHFCQUFxQixTQUFTO0FBQUEsRUFDdEQ7QUFBQSxFQUNBLFFBQVEsT0FBZ0M7QUFD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
