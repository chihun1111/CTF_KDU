import { Injectable } from "@nestjs/common";
import { loadRuntimeSecrets, type RuntimeSecrets } from "@campus-ctf/config";

@Injectable()
export class RuntimeConfigService {
  private secrets?: RuntimeSecrets;

  getRuntimeSecrets(): RuntimeSecrets {
    this.secrets ??= loadRuntimeSecrets();
    return this.secrets;
  }
}
