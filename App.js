import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@derretendo_iceberg_db_v2';
const OLD_STORAGE_KEY = '@derretendo_iceberg_db';
const ICEBERG_GIF = 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExYm56dDhnbWlxczZ3MXI1Z3l2ejZxcnc0c2thdXUxaDk3d3gxb2E2eiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/llCcLPkoz456ieiJ6a/giphy.gif';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function numberValue(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return 0;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  return Number(normalized) || 0;
}

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const newForm = () => ({ name: '', initialValue: '', monthlyPayment: '', totalInstallments: '', interest: '' });

function IcebergImage({ size = 88, style }) {
  return <Image source={{ uri: ICEBERG_GIF }} resizeMode="contain" style={[{ width: size, height: size }, style]} />;
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [debts, setDebts] = useState([]);
  const [activeDebtId, setActiveDebtId] = useState(null);
  const [tab, setTab] = useState('arena');
  const [form, setForm] = useState(newForm());
  const [editingId, setEditingId] = useState(null);
  const [formReturnTab, setFormReturnTab] = useState('lista');
  const [paymentValue, setPaymentValue] = useState('');
  const [paymentType, setPaymentType] = useState('mensal');
  const [paymentNote, setPaymentNote] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const list = Array.isArray(data.debts) ? data.debts : [];
        setDebts(list);
        setActiveDebtId(data.activeDebtId || list[0]?.id || null);
      } else {
        const oldRaw = await AsyncStorage.getItem(OLD_STORAGE_KEY);
        if (oldRaw) {
          const old = JSON.parse(oldRaw);
          if (old.debt) {
            const migrated = {
              ...old.debt,
              id: old.debt.id || String(Date.now()),
              payments: Array.isArray(old.payments) ? old.payments : [],
            };
            const list = [migrated];
            setDebts(list);
            setActiveDebtId(migrated.id);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: list, activeDebtId: migrated.id }));
          }
        }
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível carregar os dados salvos.');
    } finally {
      setLoaded(true);
    }
  }

  async function persist(nextDebts, nextActiveId = activeDebtId) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: nextDebts, activeDebtId: nextActiveId }));
    setDebts(nextDebts);
    setActiveDebtId(nextActiveId);
  }

  const activeDebt = debts.find((item) => String(item.id) === String(activeDebtId)) || null;
  const payments = activeDebt && Array.isArray(activeDebt.payments) ? activeDebt.payments : [];
  const totalPaid = useMemo(() => payments.reduce((sum, item) => sum + numberValue(item.value), 0), [payments]);
  const remaining = activeDebt ? Math.max(0, numberValue(activeDebt.initialValue) - totalPaid) : 0;
  const progress = activeDebt && numberValue(activeDebt.initialValue) > 0
    ? Math.min(100, (totalPaid / numberValue(activeDebt.initialValue)) * 100) : 0;
  const paidInstallments = payments.filter((item) => item.type === 'mensal').length;
  const armorTotal = Math.max(0, numberValue(activeDebt?.totalInstallments));
  const armorBroken = Math.min(armorTotal, paidInstallments);
  const interest = numberValue(activeDebt?.interest);
  const monthlyHealing = remaining * (interest / 100);
  const monthlyFreed = numberValue(activeDebt?.monthlyPayment);

  function updateForm(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  function startNewDebt() {
    setEditingId(null); setForm(newForm()); setFormReturnTab('lista'); setTab('adicionar');
  }
  function startEditDebt(debt = activeDebt, returnTab = 'arena') {
    if (!debt) return;
    setFormReturnTab(returnTab); setEditingId(debt.id);
    setForm({
      name: debt.name || '', initialValue: String(debt.initialValue ?? ''),
      monthlyPayment: String(debt.monthlyPayment ?? ''),
      totalInstallments: String(debt.totalInstallments ?? ''), interest: String(debt.interest ?? ''),
    });
    setActiveDebtId(debt.id); setTab('adicionar');
  }

  async function saveDebt() {
    const total = numberValue(form.initialValue);
    if (total <= 0) { Alert.alert('Atenção', 'Digite um saldo devedor maior que zero.'); return; }
    const fields = {
      name: form.name.trim() || 'Minha dívida', initialValue: total,
      monthlyPayment: numberValue(form.monthlyPayment),
      totalInstallments: Math.max(0, parseInt(form.totalInstallments, 10) || 0),
      interest: numberValue(form.interest),
    };
    let next; let id;
    if (editingId) {
      id = editingId;
      next = debts.map((item) => String(item.id) === String(editingId) ? { ...item, ...fields } : item);
    } else {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      next = [{ id, ...fields, createdAt: today(), payments: [] }, ...debts];
    }
    try {
      await persist(next, id); setForm(newForm()); setEditingId(null); setTab(formReturnTab);
    } catch (error) { Alert.alert('Erro', 'Não foi possível salvar a dívida. Tente novamente.'); }
  }

  function askDeleteDebt(debt) {
    if (!debt) return;
    Alert.alert('Excluir este iceberg?', `A dívida "${debt.name}" e todos os pagamentos dela serão excluídos. Essa ação não pode ser desfeita.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir dívida', style: 'destructive', onPress: () => confirmDeleteDebt(debt) },
    ]);
  }

  async function confirmDeleteDebt(debt) {
    const next = debts.filter((item) => String(item.id) !== String(debt.id));
    const nextActiveId = String(activeDebtId) === String(debt.id) ? (next[0]?.id || null) : activeDebtId;
    try {
      await persist(next, nextActiveId); setForm(newForm()); setEditingId(null);
      setTab(next.length ? 'lista' : 'arena');
      Alert.alert('Dívida excluída', 'O iceberg foi removido com sucesso.');
    } catch (error) { Alert.alert('Erro', 'Não foi possível excluir. Verifique o armazenamento e tente novamente.'); }
  }

  async function addPayment() {
    if (!activeDebt) { Alert.alert('Escolha uma dívida', 'Cadastre ou selecione um iceberg antes de registrar pagamentos.'); return; }
    const value = numberValue(paymentValue);
    if (value <= 0) { Alert.alert('Atenção', 'Digite um valor de pagamento maior que zero.'); return; }
    if (remaining <= 0) { Alert.alert('Iceberg derretido!', 'Essa dívida já foi quitada.'); return; }
    if (value > remaining) { Alert.alert('Valor maior que o restante', `Ainda falta ${money(remaining)}. Ajuste o valor do pagamento.`); return; }
    const payment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      value, type: paymentType, note: paymentNote.trim(), date: today(),
    };
    const next = debts.map((item) => String(item.id) === String(activeDebt.id)
      ? { ...item, payments: [payment, ...(item.payments || [])] } : item);
    try {
      await persist(next, activeDebt.id); setPaymentValue(''); setPaymentNote('');
      const wasCritical = paymentType === 'extra'; setPaymentType('mensal'); setTab('arena');
      Alert.alert(wasCritical ? '🔥 ATAQUE CRÍTICO!' : '⚔️ ATAQUE REALIZADO!', `${money(value)} registrados em "${activeDebt.name}". ${wasCritical ? 'Golpe extra aplicado!' : 'A batalha avançou!'}`);
    } catch (error) { Alert.alert('Erro', 'Não foi possível salvar o pagamento.'); }
  }

  function deletePayment(paymentId) {
    if (!activeDebt) return;
    Alert.alert('Excluir pagamento?', 'O pagamento será removido do histórico.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        const next = debts.map((item) => String(item.id) === String(activeDebt.id)
          ? { ...item, payments: (item.payments || []).filter((p) => p.id !== paymentId) } : item);
        try { await persist(next, activeDebt.id); } catch (error) { Alert.alert('Erro', 'Não foi possível excluir o pagamento.'); }
      } },
    ]);
  }

  function openArena(debt) { setActiveDebtId(debt.id); setTab('arena'); }

  function renderDebtCard(debt) {
    const listPayments = Array.isArray(debt.payments) ? debt.payments : [];
    const paid = listPayments.reduce((sum, item) => sum + numberValue(item.value), 0);
    const left = Math.max(0, numberValue(debt.initialValue) - paid);
    const percent = numberValue(debt.initialValue) > 0 ? Math.min(100, paid / numberValue(debt.initialValue) * 100) : 0;
    return (
      <View key={debt.id} style={styles.debtCard}>
        <TouchableOpacity style={styles.debtSelect} onPress={() => openArena(debt)} activeOpacity={0.8}>
          <IcebergImage size={70} style={styles.debtImage} />
          <View style={styles.debtInfo}>
            <Text style={styles.debtName}>{debt.name}</Text>
            <Text style={styles.muted}>{left <= 0 ? '🏆 Chefe derrotado!' : `Saldo restante: ${money(left)}`}</Text>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View>
            <Text style={styles.muted}>{percent.toFixed(1)}% pago</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.debtActions}>
          <TouchableOpacity style={styles.smallButton} onPress={() => startEditDebt(debt, 'lista')}><Text style={styles.smallButtonText}>Editar</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.smallButton, styles.deleteButton]} onPress={() => askDeleteDebt(debt)}><Text style={[styles.smallButtonText, styles.deleteText]}>Excluir dívida</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!loaded) return <SafeAreaView style={styles.loading}><Text style={styles.sectionTitle}>Preparando seus icebergs…</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Derretendo o Iceberg</Text>
          <Text style={styles.headerSubtitle}>{activeDebt ? `Arena: ${activeDebt.name}` : 'Cada dívida é um iceberg diferente'}</Text>
        </View>
        <View style={styles.nav}>
          {[[ 'arena', 'Arena atual' ], [ 'lista', 'Meus icebergs' ], [ 'pagar', 'Registrar pagamento' ], [ 'historico', 'Histórico' ]].map(([key, label]) => (
            <TouchableOpacity key={key} style={[styles.navButton, tab === key && styles.navActive]} onPress={() => setTab(key)}>
              <Text style={[styles.navText, tab === key && styles.navTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'lista' && (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>Meus icebergs</Text>
            <Text style={styles.subtitle}>Toque em uma dívida para entrar na Arena Financeira e acompanhar a batalha.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={startNewDebt}><Text style={styles.primaryButtonText}>＋ CADASTRAR NOVA DÍVIDA</Text></TouchableOpacity>
            {debts.length === 0 ? <View style={styles.card}><Text style={styles.bodyText}>Você ainda não cadastrou nenhuma dívida.</Text></View> : debts.map(renderDebtCard)}
          </ScrollView>
        )}

        {tab === 'adicionar' && (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>{editingId ? 'Editar dívida' : 'Cadastrar dívida'}</Text>
            <Text style={styles.subtitle}>Preencha os dados deste iceberg.</Text>
            <View style={styles.card}>
              <Text style={styles.label}>Nome da dívida</Text>
              <TextInput style={styles.input} placeholder="Ex.: Cartão, carro, empréstimo" value={form.name} onChangeText={(v) => updateForm('name', v)} />
              <Text style={styles.label}>Saldo devedor atual (R$)</Text>
              <TextInput style={styles.input} placeholder="Ex.: 5000 ou 1.234,56" value={form.initialValue} onChangeText={(v) => updateForm('initialValue', v)} keyboardType="decimal-pad" />
              <Text style={styles.label}>Parcela mensal (opcional)</Text>
              <TextInput style={styles.input} placeholder="Ex.: 300" value={form.monthlyPayment} onChangeText={(v) => updateForm('monthlyPayment', v)} keyboardType="decimal-pad" />
              <Text style={styles.label}>Quantidade de parcelas (opcional)</Text>
              <TextInput style={styles.input} placeholder="Ex.: 12" value={form.totalInstallments} onChangeText={(v) => updateForm('totalInstallments', v)} keyboardType="numeric" />
              <Text style={styles.label}>Juros ao mês em % (opcional)</Text>
              <TextInput style={styles.input} placeholder="Ex.: 5" value={form.interest} onChangeText={(v) => updateForm('interest', v)} keyboardType="decimal-pad" />
              <Text style={styles.helperText}>Os juros são uma estimativa visual; o saldo não aumenta automaticamente.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={saveDebt}><Text style={styles.primaryButtonText}>{editingId ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR ICEBERG'}</Text></TouchableOpacity>
              {editingId && <TouchableOpacity style={[styles.secondaryButton, styles.dangerButton]} onPress={() => askDeleteDebt(activeDebt)}><Text style={styles.primaryButtonText}>EXCLUIR ESTA DÍVIDA</Text></TouchableOpacity>}
              <TouchableOpacity style={styles.secondaryButton} onPress={() => { setForm(newForm()); setEditingId(null); setTab(formReturnTab); }}><Text style={styles.secondaryButtonText}>Cancelar</Text></TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {tab === 'arena' && (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {!activeDebt ? (
              <View style={styles.card}>
                <IcebergImage size={150} />
                <Text style={styles.sectionTitle}>Vamos cadastrar seu primeiro iceberg</Text>
                <Text style={styles.subtitle}>Cada dívida vira um chefe de fase. Seus pagamentos diminuem o HP do monstro.</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={startNewDebt}><Text style={styles.primaryButtonText}>＋ CADASTRAR DÍVIDA</Text></TouchableOpacity>
                {debts.length > 0 && <TouchableOpacity style={styles.secondaryButton} onPress={() => setTab('lista')}><Text style={styles.secondaryButtonText}>Ver meus icebergs</Text></TouchableOpacity>}
              </View>
            ) : (
              <>
                <View style={styles.arenaBanner}>
                  <Text style={styles.arenaEyebrow}>ARENA FINANCEIRA · CHEFE DE FASE</Text>
                  <IcebergImage size={160} style={styles.bossImage} />
                  <Text style={styles.bossName}>{remaining <= 0 ? `${activeDebt.name} — DERROTADO!` : activeDebt.name}</Text>
                  <Text style={styles.bossType}>{remaining <= 0 ? 'VITÓRIA CONQUISTADA' : interest > 0 ? 'MONSTRO QUE SE REGENERA' : 'MONSTRO COM ARMADURA'}</Text>
                  <Text style={styles.bossHpLabel}>HP / SALDO ATUAL</Text>
                  <Text style={styles.bossHp}>{money(remaining)}</Text>
                  <View style={styles.hpTrack}><View style={[styles.hpFill, { width: `${Math.max(0, 100 - progress)}%` }]} /></View>
                  <Text style={styles.arenaHint}>{progress.toFixed(1)}% da dívida reduzida com pagamentos registrados</Text>
                </View>

                {remaining <= 0 && (
                  <View style={styles.victoryCard}>
                    <Text style={styles.victoryEmoji}>🏆</Text>
                    <Text style={styles.cardTitle}>Chefe derrotado!</Text>
                    <Text style={styles.bodyText}>Você registrou pagamentos suficientes para quitar este iceberg. Parabéns por avançar na sua vida financeira!</Text>
                    <Text style={styles.bodyText}>Valor mensal potencialmente liberado: {money(monthlyFreed)}</Text>
                  </View>
                )}

                {remaining > 0 && interest > 0 && (
                  <View style={styles.warningCard}>
                    <Text style={styles.cardTitle}>🔥 Regeneração estimada</Text>
                    <Text style={styles.bodyText}>Com juros informados de {interest.toLocaleString('pt-BR')}% ao mês, a estimativa sobre o saldo atual é de {money(monthlyHealing)} por mês.</Text>
                    <Text style={styles.helperText}>Simulação visual: nenhum juro é adicionado automaticamente ao saldo salvo.</Text>
                  </View>
                )}

                {remaining > 0 && interest <= 0 && (
                  <View style={styles.armorCard}>
                    <Text style={styles.cardTitle}>🛡️ Armadura de parcelas</Text>
                    {armorTotal > 0 ? <Text style={styles.bodyText}>{armorBroken} de {armorTotal} parcelas mensais registradas como pagas.</Text> : <Text style={styles.bodyText}>Você pode cadastrar a quantidade de parcelas ao editar a dívida.</Text>}
                    {armorTotal > 0 && <View style={styles.armorGrid}>{Array.from({ length: Math.min(armorTotal, 36) }, (_, index) => <View key={index} style={[styles.armorPlate, index < armorBroken && styles.armorPlateBroken]}><Text style={styles.armorPlateText}>{index < armorBroken ? '✓' : '◆'}</Text></View>)}</View>}
                    {armorTotal > 36 && <Text style={styles.helperText}>Mostrando 36 de {armorTotal} placas.</Text>}
                  </View>
                )}

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>📊 Status da batalha</Text>
                  <View style={styles.statusLine}><Text style={styles.statusLabel}>Saldo inicial</Text><Text style={styles.statusValue}>{money(activeDebt.initialValue)}</Text></View>
                  <View style={styles.statusLine}><Text style={styles.statusLabel}>Total pago</Text><Text style={styles.statusValue}>{money(totalPaid)}</Text></View>
                  <View style={styles.statusLine}><Text style={styles.statusLabel}>Progresso</Text><Text style={styles.statusValue}>{progress.toFixed(1)}%</Text></View>
                  <View style={styles.statusLine}><Text style={styles.statusLabel}>Parcela mensal cadastrada</Text><Text style={styles.statusValue}>{money(activeDebt.monthlyPayment)}</Text></View>
                  {remaining > 0 && <TouchableOpacity style={styles.primaryButton} onPress={() => { setPaymentType('mensal'); setTab('pagar'); }}><Text style={styles.primaryButtonText}>⚔️ ATAQUE BÁSICO / REGISTRAR PAGAMENTO</Text></TouchableOpacity>}
                  {remaining > 0 && <TouchableOpacity style={[styles.primaryButton, styles.criticalButton]} onPress={() => { setPaymentType('extra'); setTab('pagar'); }}><Text style={styles.primaryButtonText}>🔥 ATAQUE CRÍTICO / PAGAMENTO EXTRA</Text></TouchableOpacity>}
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => startEditDebt(activeDebt, 'arena')}><Text style={styles.secondaryButtonText}>Editar esta dívida</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.secondaryButton, styles.dangerButton]} onPress={() => askDeleteDebt(activeDebt)}><Text style={styles.primaryButtonText}>Excluir esta dívida</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setTab('historico')}><Text style={styles.secondaryButtonText}>Ver relatório de batalha e histórico</Text></TouchableOpacity>
                </View>

                {debts.length > 1 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Outros icebergs</Text>
                    {debts.filter((item) => String(item.id) !== String(activeDebt.id)).map((item) => {
                      const itemPaid = (item.payments || []).reduce((sum, p) => sum + numberValue(p.value), 0);
                      const itemLeft = Math.max(0, numberValue(item.initialValue) - itemPaid);
                      return <TouchableOpacity key={item.id} style={styles.otherDebtRow} onPress={() => openArena(item)}>
                        <IcebergImage size={54} />
                        <View style={styles.debtInfo}><Text style={styles.debtName}>{item.name}</Text><Text style={styles.muted}>{money(itemLeft)} restantes</Text></View>
                        <Text style={styles.enterArena}>ENTRAR ›</Text>
                      </TouchableOpacity>;
                    })}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}

        {tab === 'pagar' && (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>Registrar ataque</Text>
            {!activeDebt ? <View style={styles.card}><Text style={styles.bodyText}>Primeiro, selecione ou cadastre uma dívida.</Text><TouchableOpacity style={styles.primaryButton} onPress={() => setTab('lista')}><Text style={styles.primaryButtonText}>ESCOLHER ICEBERG</Text></TouchableOpacity></View> : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Chefe: {activeDebt.name}</Text>
                <Text style={styles.bodyText}>HP restante: {money(remaining)}</Text>
                <View style={styles.typeRow}>
                  <TouchableOpacity style={[styles.typeButton, paymentType === 'mensal' && styles.typeActive]} onPress={() => setPaymentType('mensal')}><Text style={[styles.typeText, paymentType === 'mensal' && styles.typeTextActive]}>⚔️ Ataque básico</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.typeButton, paymentType === 'extra' && styles.typeActive]} onPress={() => setPaymentType('extra')}><Text style={[styles.typeText, paymentType === 'extra' && styles.typeTextActive]}>🔥 Ataque crítico</Text></TouchableOpacity>
                </View>
                <Text style={styles.label}>Valor do ataque (R$)</Text>
                <TextInput style={styles.input} placeholder="Ex.: 300 ou 300,50" value={paymentValue} onChangeText={setPaymentValue} keyboardType="decimal-pad" />
                <Text style={styles.label}>Nota (opcional)</Text>
                <TextInput style={styles.input} placeholder="Ex.: parcela de outubro" value={paymentNote} onChangeText={setPaymentNote} />
                <TouchableOpacity style={styles.primaryButton} onPress={addPayment}><Text style={styles.primaryButtonText}>SALVAR ATAQUE</Text></TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setTab('arena')}><Text style={styles.secondaryButtonText}>Voltar à Arena</Text></TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {tab === 'historico' && (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>Relatório de batalha</Text>
            {!activeDebt ? <View style={styles.card}><Text style={styles.subtitle}>Selecione um monstro para ver o histórico.</Text><TouchableOpacity style={styles.primaryButton} onPress={() => setTab('lista')}><Text style={styles.primaryButtonText}>ESCOLHER ICEBERG</Text></TouchableOpacity></View> : (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{activeDebt.name}</Text>
                  <Text style={styles.bodyText}>Saldo atual: {money(remaining)}</Text>
                  <Text style={styles.bodyText}>Total registrado: {money(totalPaid)}</Text>
                  <Text style={styles.bodyText}>Ataques críticos: {payments.filter((item) => item.type === 'extra').length}</Text>
                  <Text style={styles.bodyText}>Ataques básicos: {payments.filter((item) => item.type === 'mensal').length}</Text>
                  {remaining <= 0 && <Text style={styles.bodyText}>🏆 Vitória! Valor mensal potencialmente liberado: {money(monthlyFreed)}</Text>}
                </View>
                {payments.length === 0 ? <View style={styles.card}><Text style={styles.bodyText}>Ainda não há ataques registrados para esta dívida.</Text></View> : payments.map((item) => (
                  <View key={item.id} style={styles.paymentRow}>
                    <View style={styles.paymentInfo}><Text style={styles.paymentAmount}>{money(item.value)}</Text><Text style={styles.muted}>{item.date} · {item.type === 'extra' ? 'Ataque crítico' : 'Ataque básico'}</Text>{!!item.note && <Text style={styles.bodyText}>{item.note}</Text>}</View>
                    <TouchableOpacity style={[styles.smallButton, styles.deleteButton]} onPress={() => deletePayment(item.id)}><Text style={[styles.smallButtonText, styles.deleteText]}>Excluir</Text></TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#edf6f8' },
  keyboardArea: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf6f8' },
  header: { backgroundColor: '#103746', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  headerSubtitle: { color: '#c9e5ec', marginTop: 5, fontSize: 13 },
  nav: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#fff', paddingHorizontal: 6, paddingVertical: 7, justifyContent: 'center' },
  navButton: { paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, margin: 3, backgroundColor: '#edf4f6' },
  navActive: { backgroundColor: '#17677b' },
  navText: { color: '#33535d', fontSize: 12, fontWeight: '800' },
  navTextActive: { color: '#fff' },
  content: { padding: 16, paddingBottom: 36 },
  sectionTitle: { fontSize: 23, fontWeight: '900', color: '#103746', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#58717a', lineHeight: 21, marginBottom: 16 },
  card: { backgroundColor: '#fff', padding: 17, borderRadius: 18, marginBottom: 14, elevation: 1 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: '#103746', marginBottom: 10 },
  label: { color: '#31515c', fontWeight: '800', fontSize: 13, marginTop: 13, marginBottom: 6 },
  input: { backgroundColor: '#f2f7f8', borderWidth: 1, borderColor: '#d9e7ea', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, color: '#173c48' },
  primaryButton: { backgroundColor: '#17677b', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 13, textAlign: 'center' },
  secondaryButton: { backgroundColor: '#edf4f6', borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 9 },
  secondaryButtonText: { color: '#31515c', fontWeight: '800', fontSize: 13 },
  dangerButton: { backgroundColor: '#a52d36' },
  bodyText: { color: '#526d76', fontSize: 14, lineHeight: 20, marginVertical: 3 },
  helperText: { color: '#71868d', fontSize: 12, lineHeight: 18, marginTop: 9 },
  debtCard: { backgroundColor: '#fff', borderRadius: 17, padding: 13, marginBottom: 12, borderWidth: 1, borderColor: '#e0ebee' },
  debtSelect: { flexDirection: 'row', alignItems: 'center' },
  debtImage: { borderRadius: 10, marginRight: 12 },
  debtInfo: { flex: 1 },
  debtName: { fontSize: 16, fontWeight: '900', color: '#103746' },
  muted: { color: '#71868d', fontSize: 12, marginTop: 4 },
  debtActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  smallButton: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#edf4f6', borderRadius: 9, marginLeft: 7 },
  smallButtonText: { color: '#31515c', fontSize: 12, fontWeight: '800' },
  deleteButton: { backgroundColor: '#fff0f0' },
  deleteText: { color: '#a52d36' },
  progressTrack: { width: '100%', height: 8, borderRadius: 20, backgroundColor: '#d6e7eb', overflow: 'hidden', marginTop: 8, marginBottom: 3 },
  progressFill: { height: '100%', backgroundColor: '#f7b955', borderRadius: 20 },
  arenaBanner: { backgroundColor: '#102f3d', borderRadius: 23, padding: 21, alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: '#315b6a' },
  arenaEyebrow: { color: '#a9d6df', fontSize: 10, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center' },
  bossImage: { marginTop: 10, borderRadius: 12 },
  bossName: { color: '#fff', fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  bossType: { color: '#f7b955', fontSize: 11, fontWeight: '900', letterSpacing: 0.7, marginTop: 7, textAlign: 'center' },
  bossHpLabel: { color: '#b8dce4', fontSize: 10, fontWeight: '900', marginTop: 20 },
  bossHp: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 3 },
  hpTrack: { width: '100%', height: 16, borderRadius: 20, backgroundColor: '#672f38', overflow: 'hidden', marginTop: 10 },
  hpFill: { height: '100%', backgroundColor: '#e14f5b', borderRadius: 20 },
  arenaHint: { color: '#d5edf2', fontSize: 12, marginTop: 10, textAlign: 'center' },
  warningCard: { backgroundColor: '#fff3f1', borderColor: '#f1c7c3', borderWidth: 1, borderRadius: 17, padding: 16, marginBottom: 14 },
  armorCard: { backgroundColor: '#fffaf0', borderColor: '#ead7a7', borderWidth: 1, borderRadius: 17, padding: 16, marginBottom: 14 },
  armorGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  armorPlate: { width: 29, height: 29, borderRadius: 6, backgroundColor: '#d4dce0', alignItems: 'center', justifyContent: 'center', margin: 3, borderWidth: 1, borderColor: '#9aabb2' },
  armorPlateBroken: { backgroundColor: '#b7dfc7', borderColor: '#69a783' },
  armorPlateText: { color: '#31515c', fontWeight: '900' },
  criticalButton: { backgroundColor: '#a33a22' },
  victoryCard: { backgroundColor: '#fff9e8', borderColor: '#e9ce7c', borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 14 },
  victoryEmoji: { fontSize: 45, textAlign: 'center', marginBottom: 8 },
  statusLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#edf2f3' },
  statusLabel: { color: '#58717a', fontSize: 12, flex: 1, marginRight: 8 },
  statusValue: { color: '#103746', fontSize: 13, fontWeight: '900' },
  otherDebtRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#edf2f3' },
  enterArena: { color: '#17677b', fontSize: 12, fontWeight: '900', marginLeft: 8 },
  typeRow: { flexDirection: 'row', marginTop: 12, marginBottom: 8 },
  typeButton: { flex: 1, padding: 12, borderRadius: 11, alignItems: 'center', backgroundColor: '#edf4f6', marginRight: 5 },
  typeActive: { backgroundColor: '#17677b' },
  typeText: { color: '#31515c', fontWeight: '900', fontSize: 12 },
  typeTextActive: { color: '#fff' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 13, marginBottom: 10 },
  paymentInfo: { flex: 1 },
  paymentAmount: { color: '#103746', fontSize: 17, fontWeight: '900' },
});
