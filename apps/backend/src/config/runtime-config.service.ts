import { Injectable, type OnModuleInit } from "@nestjs/common";
import { loadRuntimeSecrets, type RuntimeSecrets } from "@campus-ctf/config";

@Injectable()
export class RuntimeConfigService implements OnModuleInit {
  private secrets?: RuntimeSecrets;

  onModuleInit(): void {
    // A green health endpoint must never precede validation of required keys.
    this.getRuntimeSecrets();
  }

  getRuntimeSecrets(): RuntimeSecrets {
    this.secrets ??= loadRuntimeSecrets();
    return this.secrets;
  }
}
