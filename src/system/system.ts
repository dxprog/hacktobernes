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

const CHR_ROM_VIDEO_ADDRESS_MASK = 0x1fff;
const VRAM_VIDEO_ADDRESS_MASK = 0x2000;

export class System {
  private parentEl: HTMLElement;
  private bus: Bus;
  private ppuBus: Bus;
  private cart: Cart;
  private wram: Wram;
  private vram: Wram;
  private cpu: Cpu;
  private ppu: Ppu;
  private nmiRaised: boolean;

  constructor(cart: Cart, parentEl: HTMLElement) {
    this.parentEl = parentEl;

    this.bus = new Bus();
    this.ppuBus = new Bus();
    this.wram = new Wram();
    this.cpu = new Cpu(this.bus);

    this.ppuBus = new Bus();
    this.vram = new Wram();
    this.ppu = new Ppu(this.nmi.bind(this), this.ppuBus, this.parentEl);
    this.cart = cart;

    this.buildMemoryMap();
    this.cpu.reset();
  }

  private nmi() {
    this.nmiRaised = true;
    this.cpu.nmi();
  }

  private buildMemoryMap() {
    // SYSTEM BUS
    // wram: 0x0000-0x1FFF
    this.bus.attachChip(WRAM_ADDRESS_MASK, this.wram, true);
    // cart: 0x8000-0xFFFF
    this.bus.attachChip(CART_ADDRESS_MASK, this.cart.prgRom);
    // ppu: 0x2000-0x3FFF
    this.bus.attachChip(PPU_ADDRESS, this.ppu);

    // VIDEO BUS
    // in reality, the bus hookups for this are way more complex due to reducing
    // pin count on the PPU... I ain't gonna model that here. this is already
    // too fancy...
    // chr rom: 0x0000-0x1FFF
    this.ppuBus.attachChip(CHR_ROM_VIDEO_ADDRESS_MASK, this.cart.chrRom, true);
    // vram: 0x2000-0x3FFFF
    this.ppuBus.attachChip(VRAM_VIDEO_ADDRESS_MASK, this.vram);
  }

  public clock() {
    this.cpu.clock();
    // it's always gonna be three ppu clocks to one cpu clock.
    // it's ugly, but not gonna loop for perf
    this.ppu.clock();
    this.ppu.clock();
    this.ppu.clock();
  }

  /**
   * Runs the entire system for one frame. System stops when NMI from the
   * PPU is raised.
   */
  public renderFrame() {
    while (!this.nmiRaised) {
      this.clock();
    }
    this.nmiRaised = false;
  }
}
