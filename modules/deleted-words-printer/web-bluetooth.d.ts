// Ambient types for the slice of Web Bluetooth (Chromium-only, absent from
// the DOM lib) this module uses.

interface BluetoothLEScanFilters {}

interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: Array<Record<string, never>>;
  optionalServices?: string[];
}

interface BluetoothRemoteGATTCharacteristic {
  readonly uuid: string;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValue(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: number | string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: number | string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothDevice {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  bluetooth?: Bluetooth;
}

// OffscreenCanvas is exported by the 2022 DOM lib in most setups, but declare
// the bits we use to be safe.
interface OffscreenCanvasRenderingContext2D {
  drawImage(image: unknown, sx: number, sy: number, sw: number, sh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
}
