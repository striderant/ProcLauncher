import React from 'react';
import {
  Gamepad2,
  Sprout, Shovel, Mountain, Gem, Coins, Sword, Bomb, Star,
  Pickaxe, Axe, Flame, Crown, Ghost, Zap,
} from 'lucide-react';

export const ICON_CHOICES = ['Grass', 'Dirt', 'Stone', 'Diamond', 'Gold', 'Sword', 'TNT', 'Star',
  'Pickaxe', 'Axe', 'Flame', 'Crown', 'Ghost', 'Zap'];

export const ICON_MAP = {
  Grass: Sprout,
  Dirt: Shovel,
  Stone: Mountain,
  Diamond: Gem,
  Gold: Coins,
  Sword: Sword,
  TNT: Bomb,
  Star: Star,
  Pickaxe: Pickaxe,
  Axe: Axe,
  Flame: Flame,
  Crown: Crown,
  Ghost: Ghost,
  Zap: Zap,
};

export function InstanceIcon({ icon, size = 20, className = 'text-white/80' }) {
  const Glyph = ICON_MAP[icon] || Gamepad2;
  return <Glyph size={size} className={className} />;
}
