import { Cart } from "../cart/cart";
import { Bus } from "./bus";
import { Cpu } from "./cpu";
import { Ppu } from "./ppu";
import { Wram } from "./wram";

// wram gets mirrored a whole bunch and sits at the beginning of memory
const WRAM_ADDRESS_MASK = 0x1fff;
const PPU_ADDRESS = 0x2000;
// anything with bit fifteen set is cart
const CART_ADDRESS_MASK = 0x8000;

export class System {
  private bus: Bus;
  private cart: Cart;
  private wram: Wram;
  private cpu: Cpu;
  private ppu: Ppu;

  constructor(cart: Cart) {
    this.bus = new Bus();
    this.wram = new Wram();
    this.ppu = new Ppu();
    this.cpu = new Cpu(this.bus);
    this.cart = cart;

    this.buildMemoryMap();
    this.cpu.reset();
  }

  private buildMemoryMap() {
    // wram: 0x0000-0x1FFF
    this.bus.attachChip(WRAM_ADDRESS_MASK, this.wram, true);
    // cart: 0x8000-0xFFFF
    this.bus.attachChip(CART_ADDRESS_MASK, this.cart);
    // ppu: 0x2000-0x3FFF
    this.bus.attachChip(PPU_ADDRESS, this.ppu);
  }

  public clock() {
    this.cpu.clock();
    // it's always gonna be three ppu clocks to one cpu clock.
    // it's ugly, but not gonna loop for perf
    this.ppu.clock();
    this.ppu.clock();
    this.ppu.clock();
  }
}
