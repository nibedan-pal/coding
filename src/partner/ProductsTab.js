import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase, errorText } from '../lib/supabase';
import { rupees } from '../lib/format';
import { Button, C, Card, Empty, Field, Pill, Thumb, ToggleRow, s } from '../ui';

const BLANK = { id: null, name: '', unit: '', price: '', mrp: '', stock: '', images: [], is_active: true };

export default function ProductsTab({ shop, tick }) {
  const [products, setProducts] = useState(null);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').eq('shop_id', shop.id).order('name');
    setProducts(data ?? []);
  }, [shop.id]);

  useEffect(() => {
    load();
  }, [load, tick]);

  async function changeStock(p, delta) {
    const stock = Math.max(0, p.stock + delta);
    setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, stock } : x)));
    const { error } = await supabase.from('products').update({ stock }).eq('id', p.id);
    if (error) {
      Alert.alert('Could not update stock', errorText(error));
      load();
    }
  }

  if (editing) {
    return (
      <ProductForm
        shop={shop}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  const list = (products || []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const low = (products || []).filter((p) => p.stock <= 5).length;

  return (
    <View style={{ gap: 12 }}>
      <Button title="+ Add product" onPress={() => setEditing({ ...BLANK })} />
      {low ? <Text style={[s.small, { color: C.warn }]}>{low} product(s) low or out of stock</Text> : null}
      {(products || []).length > 8 ? <Field value={q} onChangeText={setQ} placeholder="Search your products" /> : null}
      {products === null ? (
        <Text style={s.small}>Loading…</Text>
      ) : list.length === 0 ? (
        <Empty text={q ? 'No product matches.' : 'No products yet. Add your best sellers first: milk, bread, eggs, rice.'} />
      ) : (
        list.map((p) => (
          <Card key={p.id} style={!p.is_active && { opacity: 0.55 }}>
            <Pressable onPress={() => setEditing(p)} style={s.row}>
              <Thumb uri={p.images?.[0]} letter={p.name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={s.strong} numberOfLines={1}>{p.name}</Text>
                <Text style={s.small}>
                  {p.unit} · {rupees(p.price)}
                  {Number(p.mrp) > Number(p.price) ? ` (MRP ${rupees(p.mrp)})` : ''}
                </Text>
              </View>
              {!p.is_active ? <Pill text="Hidden" tone="mute" /> : p.stock === 0 ? <Pill text="Out" tone="bad" /> : p.stock <= 5 ? <Pill text="Low" tone="warn" /> : null}
            </Pressable>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.small}>Stock</Text>
              <View style={s.row}>
                <Button small kind="ghost" title="−1" onPress={() => changeStock(p, -1)} />
                <Text style={[s.strong, { minWidth: 36, textAlign: 'center' }]}>{p.stock}</Text>
                <Button small kind="ghost" title="+1" onPress={() => changeStock(p, 1)} />
                <Button small kind="soft" title="+10" onPress={() => changeStock(p, 10)} />
              </View>
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

function ProductForm({ shop, initial, onClose, onSaved }) {
  const [f, setF] = useState({
    ...initial,
    price: initial.price === '' ? '' : String(initial.price),
    mrp: initial.mrp === '' ? '' : String(initial.mrp),
    stock: initial.stock === '' ? '' : String(initial.stock),
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Photos permission needed', 'Allow photo access to add product images.');
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (r.canceled || !r.assets?.[0]?.base64) return;
    const a = r.assets[0];
    setUploading(true);
    try {
      const type = a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const path = `${shop.id}/${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`;
      const { error } = await supabase.storage.from('product-images').upload(path, decode(a.base64), { contentType: type });
      if (error) throw error;
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      setF((x) => ({ ...x, images: [data.publicUrl] }));
    } catch (e) {
      Alert.alert('Could not upload photo', errorText(e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const price = Number(f.price);
    const mrp = f.mrp === '' ? price : Number(f.mrp);
    const stock = f.stock === '' ? 0 : parseInt(f.stock, 10);
    if (!f.name.trim()) return Alert.alert('Missing details', 'Enter the product name.');
    if (!(price > 0)) return Alert.alert('Missing details', 'Enter a selling price above ₹0.');
    if (!(mrp >= price)) return Alert.alert('Check MRP', 'MRP cannot be lower than the selling price.');
    if (!(stock >= 0)) return Alert.alert('Check stock', 'Stock must be 0 or more.');
    setSaving(true);
    try {
      const row = {
        shop_id: shop.id,
        category_id: shop.category_id,
        name: f.name.trim(),
        unit: f.unit.trim() || '1 pc',
        price,
        mrp,
        stock,
        images: f.images || [],
        is_active: f.is_active,
      };
      const { error } = f.id
        ? await supabase.from('products').update(row).eq('id', f.id)
        : await supabase.from('products').insert(row);
      if (error) throw error;
      onSaved();
    } catch (e) {
      Alert.alert('Could not save product', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.h2}>{f.id ? 'Edit product' : 'New product'}</Text>
        <Button small kind="ghost" title="Cancel" onPress={onClose} />
      </View>
      <Pressable onPress={pickImage} style={[s.card, { alignItems: 'center' }]}>
        <Thumb uri={f.images?.[0]} letter={f.name || '+'} size={120} color={C.line} />
        <Text style={[s.small, { color: C.accent, fontWeight: '700' }]}>
          {uploading ? 'Uploading…' : f.images?.[0] ? 'Change photo' : 'Add photo'}
        </Text>
      </Pressable>
      <Field label="Product name" value={f.name} onChangeText={set('name')} placeholder="Amul Taaza toned milk" />
      <Field label="Pack size" value={f.unit} onChangeText={set('unit')} placeholder="500 ml, 1 kg, 6 pcs" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field style={{ flex: 1 }} label="Selling price ₹" value={f.price} onChangeText={set('price')} keyboardType="decimal-pad" placeholder="29" />
        <Field style={{ flex: 1 }} label="MRP ₹" value={f.mrp} onChangeText={set('mrp')} keyboardType="decimal-pad" placeholder="30" />
      </View>
      <Field label="Stock" value={f.stock} onChangeText={(t) => set('stock')(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="20" />
      <ToggleRow label="Show to customers" sub="Turn off to hide without deleting" value={f.is_active} onChange={set('is_active')} />
      <Button title="Save product" onPress={save} loading={saving} disabled={uploading} />
    </View>
  );
}
