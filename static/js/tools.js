/* Society MLBB — Ferramentas */
(() => {
  const content = document.getElementById("toolsContent");
  let toolsReadyResolve;
  const toolsReady = new Promise(resolve => { toolsReadyResolve = resolve; });
  const eventSkinEvents = {
    eventX: {name:"Evento X (exemplo)", tokenName:"tokens", skinTokens:500, spinTokens:20, bonusTokensPerSpin:0,
      spinDiamonds:50, discountDiamonds:25, discountedSpinsPerDay:1, maxSpinsPerDay:null, endDate:null},
    eventY: {name:"Evento Y (exemplo)", tokenName:"moedas", skinTokens:600, spinTokens:30, bonusTokensPerSpin:0,
      spinDiamonds:40, discountDiamonds:20, discountedSpinsPerDay:2, maxSpinsPerDay:null, endDate:null},
    eventZ: {name:"Evento Z (exemplo)", tokenName:"emblemas", skinTokens:300, spinTokens:10, bonusTokensPerSpin:0,
      spinDiamonds:15, discountDiamonds:10, discountedSpinsPerDay:1, maxSpinsPerDay:null, endDate:null}
  };

  function showLoadError() {
    content.classList.remove("tools-loading");
    content.textContent = "Não foi possível carregar as ferramentas. Atualize a página e tente novamente.";
  }

  function parseNumber(id) {
    const value = document.getElementById(id).value.trim().replace(",", ".");
    return value === "" ? NaN : Number(value);
  }

  function formatPercent(value) {
    return Number(value.toFixed(2)).toLocaleString("pt-BR");
  }

  function formatInt(value) {
    return Number(value).toLocaleString("pt-BR");
  }

  function setResult(element, message, status) {
    element.textContent = message;
    element.classList.toggle("success", status === "success");
    element.classList.toggle("warning", status === "warning");
  }

  function gamesNeededForTarget(games, wins, targetPct, futurePct) {
    const t = targetPct / 100;
    const f = futurePct / 100;
    const current = wins / games;
    if (Math.abs(current * 100 - targetPct) < 0.005) return { kind: "met" };

    if (t > current) {
      if (targetPct >= 100 && f >= 1) return { kind: "impossible-100" };
      if (f <= t) return { kind: "impossible-up" };
      const raw = (t * games - wins) / (f - t);
      return {
        kind: f >= 0.9999 ? "streak-win" : "future-up",
        n: Math.max(1, Math.ceil(raw - 1e-9)),
      };
    }

    if (targetPct <= 0 && f <= 0) return { kind: "impossible-0" };
    if (f >= t) return { kind: "impossible-down" };
    const raw = (wins - t * games) / (t - f);
    return {
      kind: f <= 1e-12 ? "streak-loss" : "future-down",
      n: Math.max(1, Math.ceil(raw - 1e-9)),
    };
  }

  function lossesUntilBelow(games, wins, floorPct) {
    const t = floorPct / 100;
    if (!(t > 0) || t >= 1) return { kind: "invalid" };
    if (wins / games < t) return { kind: "already" };
    const n = Math.floor(wins / t - games) + 1;
    return { kind: "ok", n: Math.max(1, n) };
  }

  function updateWinRate() {
    const games = parseNumber("wrN");
    const current = parseNumber("wrW");
    const target = parseNumber("wrT");
    const futureRaw = parseNumber("wrFuture");
    const floorRaw = parseNumber("wrFloor");
    const future = Number.isFinite(futureRaw) ? futureRaw : 100;
    const floor = Number.isFinite(floorRaw) ? floorRaw : 50;
    const result = document.getElementById("wrOut");
    const record = document.getElementById("wrRecord");
    const margin = document.getElementById("wrMarginOut");
    const currentLabel = document.getElementById("wrNowLabel");
    const targetLabel = document.getElementById("wrGoalLabel");
    const fill = document.getElementById("barNow");
    const marker = document.getElementById("barGoal");
    const winsEl = document.getElementById("wrWins");
    const lossesEl = document.getElementById("wrLosses");
    const hero = document.getElementById("wrHero");

    const currentOk = Number.isFinite(current) && current >= 0 && current <= 100;
    const targetOk = Number.isFinite(target) && target >= 0 && target <= 100;
    const futureOk = Number.isFinite(future) && future >= 0 && future <= 100;
    const floorOk = Number.isFinite(floor) && floor >= 0 && floor < 100;
    const gamesOk = Number.isInteger(games) && games > 0;

    fill.style.width = currentOk ? Math.min(100, current) + "%" : "0%";
    marker.style.left = targetOk ? Math.min(100, target) + "%" : "0%";
    currentLabel.textContent = currentOk ? formatPercent(current) + "%" : "—";
    targetLabel.textContent = targetOk ? formatPercent(target) + "%" : "—";

    if (!gamesOk || !currentOk) {
      winsEl.textContent = "—";
      lossesEl.textContent = "—";
      hero.textContent = "—";
      record.textContent = "Preencha partidas e win rate atual para calcular vitórias e derrotas.";
      margin.textContent = "Informe seu histórico para ver quantas derrotas cabem antes de cair dessa linha.";
      setResult(result, "Preencha partidas, win rate atual e a meta.", "");
      return;
    }

    const wins = Math.round(games * current / 100);
    const losses = games - wins;
    const actual = (wins / games) * 100;
    winsEl.textContent = formatInt(wins);
    lossesEl.textContent = formatInt(losses);
    hero.textContent = formatPercent(actual) + "%";
    record.replaceChildren();
    record.append(
      "Você venceu ",
      Object.assign(document.createElement("b"), {
        textContent: formatInt(wins) + (wins === 1 ? " partida" : " partidas"),
      }),
      " e perdeu "
    );
    const lossLabel = document.createElement("b");
    lossLabel.className = "wr-loss";
    lossLabel.textContent = formatInt(losses) + (losses === 1 ? " partida" : " partidas");
    record.append(lossLabel, ". Calculamos isso a partir do win rate informado.");

    if (floorOk) {
      const drop = lossesUntilBelow(games, wins, floor);
      if (drop.kind === "already") {
        margin.textContent = "Seu win rate já está abaixo de " + formatPercent(floor) + "%.";
      } else if (drop.kind === "ok") {
        margin.textContent =
          formatInt(drop.n) +
          (drop.n === 1 ? " derrota seguida deixaria" : " derrotas seguidas deixariam") +
          " você abaixo de " + formatPercent(floor) + "%.";
      } else {
        margin.textContent = "Informe um valor entre 0% e 100% para a linha de margem.";
      }
    } else {
      margin.textContent = "Informe um valor entre 0% e 100% para a linha de margem.";
    }

    if (!targetOk) {
      setResult(result, "Informe o win rate que você quer alcançar.", "");
      return;
    }
    if (!futureOk) {
      setResult(result, "O win rate daqui em diante precisa estar entre 0% e 100%.", "warning");
      return;
    }

    const needed = gamesNeededForTarget(games, wins, target, future);
    const targetText = formatPercent(target) + "%";
    if (needed.kind === "met") {
      setResult(result, "Seu win rate já está na meta de " + targetText + ".", "success");
      return;
    }
    if (needed.kind === "impossible-100") {
      setResult(result, "Não é possível atingir 100% em um número finito de partidas se você já tem derrotas.", "warning");
      return;
    }
    if (needed.kind === "impossible-0") {
      setResult(result, "Não é possível chegar a 0% com um número finito de derrotas se você já tem vitórias.", "warning");
      return;
    }
    if (needed.kind === "impossible-up") {
      setResult(result, "Com " + formatPercent(future) + "% daqui em diante não é possível subir até " + targetText + ".", "warning");
      return;
    }
    if (needed.kind === "impossible-down") {
      setResult(result, "Com " + formatPercent(future) + "% daqui em diante o win rate não cai até " + targetText + ".", "warning");
      return;
    }
    if (needed.kind === "streak-win") {
      setResult(
        result,
        "Vença mais " + formatInt(needed.n) +
          (needed.n === 1 ? " partida seguida" : " partidas seguidas") +
          " para chegar a " + targetText + ".",
        "success"
      );
      return;
    }
    if (needed.kind === "future-up") {
      setResult(
        result,
        "Com " + formatPercent(future) + "% daqui em diante, você precisa de cerca de " +
          formatInt(needed.n) + (needed.n === 1 ? " partida" : " partidas") +
          " para chegar a " + targetText + ".",
        "success"
      );
      return;
    }
    if (needed.kind === "streak-loss") {
      setResult(
        result,
        "Se perder " + formatInt(needed.n) +
          (needed.n === 1 ? " partida seguida" : " partidas seguidas") +
          ", seu win rate cai para cerca de " + targetText + ".",
        "warning"
      );
      return;
    }
    setResult(
      result,
      "Com " + formatPercent(future) + "% daqui em diante, cerca de " +
        formatInt(needed.n) + (needed.n === 1 ? " partida" : " partidas") +
        " levariam o win rate a " + targetText + ".",
      "warning"
    );
  }

  function resetWinRate() {
    ["wrN", "wrW", "wrT"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    const future = document.getElementById("wrFuture");
    const floor = document.getElementById("wrFloor");
    if (future) future.value = "100";
    if (floor) floor.value = "50";
    updateWinRate();
    document.getElementById("wrN")?.focus();
  }

  function updateStars() {
    const stars = parseNumber("stN");
    const rate = parseNumber("stW") / 100;
    const gamesPerDay = parseNumber("stD");
    const winStars = parseNumber("stUp");
    const lossStars = parseNumber("stDown");
    const result = document.getElementById("stOut");

    if (!(stars > 0) || !Number.isFinite(rate) || rate <= 0 || rate > 1 ||
        !Number.isFinite(gamesPerDay) || gamesPerDay < 0 ||
        !Number.isFinite(winStars) || winStars <= 0 ||
        !Number.isFinite(lossStars) || lossStars < 0) {
      setResult(result, "Informe estrelas restantes, Win Rate entre 0% e 100%, partidas por dia (0 se não quiser estimar dias) e estrelas válidas por resultado.", "");
      return;
    }

    const netStarsPerGame = rate * winStars - (1 - rate) * lossStars;
    if (netStarsPerGame <= 0) {
      setResult(result, "Com esse Win Rate você não ganha estrelas em média. Aumente seu Win Rate ou ajuste as estrelas por vitória e derrota.", "warning");
      return;
    }

    const games = Math.ceil(stars / netStarsPerGame);
    const days = gamesPerDay > 0 ? " (cerca de " + Math.ceil(games / gamesPerDay) + " dias)" : "";
    setResult(result, "Estimativa: " + games.toLocaleString("pt-BR") +
      (games === 1 ? " partida" : " partidas") + days + ".", "success");
  }

  function updateSkinCost() {
    const skinDiamonds = parseNumber("skD");
    const packDiamonds = parseNumber("skPD");
    const packPrice = parseNumber("skPR");
    const result = document.getElementById("skOut");

    if (!(skinDiamonds > 0) || !(packDiamonds > 0) || !(packPrice > 0)) {
      setResult(result, "Preencha os três campos com valores maiores que zero.", "");
      return;
    }

    const price = skinDiamonds * packPrice / packDiamonds;
    const diamondPrice = packPrice / packDiamonds;
    setResult(result, "Estimativa: R$ " + price.toFixed(2).replace(".", ",") +
      " (cada diamante sai por R$ " + diamondPrice.toFixed(3).replace(".", ",") + ").", "success");
  }

  function showTool(name) {
    const menu = document.getElementById("toolsMenu");
    menu.hidden = false;
    menu.querySelectorAll("[data-tool]").forEach(button => {
      if (button.dataset.tool === name) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
    document.querySelectorAll(".tool-panel").forEach(panel => {
      panel.hidden = panel.id !== "tool-" + name;
    });
  }

  function showMenu() {
    document.getElementById("toolsMenu").hidden = false;
    document.querySelectorAll("#toolsMenu [data-tool]").forEach(button => {
      button.removeAttribute("aria-current");
    });
    document.querySelectorAll(".tool-panel").forEach(panel => { panel.hidden = true; });
    document.getElementById("toolsMenu").scrollIntoView({behavior:"smooth", block:"start"});
  }

  function toDateTimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function formatEventDate(date) {
    return new Intl.DateTimeFormat("pt-BR", {
      day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"
    }).format(date);
  }

  function eventSkinMetric(label, value) {
    const item = document.createElement("div");
    item.className = "event-skin-metric";
    const title = document.createElement("span");
    title.textContent = label;
    const amount = document.createElement("b");
    amount.textContent = value;
    item.append(title, amount);
    return item;
  }

  function eventSkinSchedule(event, days, spins, discountsToday) {
    const dailyLimit = event.maxSpinsPerDay === null ? spins : event.maxSpinsPerDay;
    const discountLimit = Math.min(event.discountedSpinsPerDay, dailyLimit);
    const schedule = Array.from({length:days}, (_, index) => ({
      day:index + 1,
      discounted:0,
      normal:0
    }));

    let discountsToUse = Math.min(spins, Math.min(discountLimit, discountsToday) +
      Math.max(0, days - 1) * discountLimit);
    schedule.forEach((entry, index) => {
      const available = index === 0 ? Math.min(discountLimit, discountsToday) : discountLimit;
      entry.discounted = Math.min(discountsToUse, available);
      discountsToUse -= entry.discounted;
    });

    let normalToUse = spins - schedule.reduce((total, entry) => total + entry.discounted, 0);
    for (let index = 0; index < schedule.length && normalToUse > 0; index++) {
      const capacity = Math.max(0, dailyLimit - schedule[index].discounted);
      const remainingCapacity = schedule.slice(index).reduce(
        (total, entry) => total + Math.max(0, dailyLimit - entry.discounted), 0
      );
      const balancedTarget = Math.ceil(normalToUse / (schedule.length - index));
      schedule[index].normal = Math.min(normalToUse, capacity,
        remainingCapacity <= normalToUse ? capacity : balancedTarget);
      normalToUse -= schedule[index].normal;
    }

    return schedule.map(entry => ({
      ...entry,
      tokensGained:(entry.discounted + entry.normal) * (event.spinTokens + (event.bonusTokensPerSpin || 0)),
      cost:entry.discounted * event.discountDiamonds + entry.normal * event.spinDiamonds
    }));
  }

  function renderEventSkinTimeline(container, schedule, tokensOwned, tokensNeeded, event) {
    container.textContent = "";
    const title = document.createElement("b");
    title.textContent = "Simulação por dia";
    container.append(title);

    const list = document.createElement("ol");
    list.className = "event-skin-day-list";
    let accumulated = tokensOwned;
    schedule.forEach(entry => {
      accumulated += entry.tokensGained;
      const remaining = Math.max(0, tokensNeeded - accumulated);
      const item = document.createElement("li");
      const heading = document.createElement("b");
      heading.textContent = "Dia " + entry.day + (entry.day === schedule.length ? " · Último dia" : "");
      const details = document.createElement("span");
      if (entry.discounted + entry.normal === 0) {
        details.textContent = "Sem giros planejados.";
      } else {
        const costs = [];
        if (entry.discounted) costs.push(entry.discounted + " giro(s) com desconto × " + event.discountDiamonds + " 💎");
        if (entry.normal) costs.push(entry.normal + " giro(s) normal(is) × " + event.spinDiamonds + " 💎");
        details.textContent = costs.join(" · ") + " · +" + entry.tokensGained +
          " " + event.tokenName + " · acumulado: " + accumulated +
          " · faltam: " + remaining;
      }
      item.append(heading, details);
      list.append(item);
    });
    container.append(list);
  }

  function setupEventSkinCalculator() {
    const select = document.getElementById("eventSkinEvent");
    Object.entries(eventSkinEvents).forEach(([id, event]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = event.name;
      select.append(option);
    });

    function selectedEvent() {
      return eventSkinEvents[select.value];
    }

    function updateEventDescription() {
      const event = selectedEvent();
      const endDateInput = document.getElementById("eventSkinEndDate");
      endDateInput.value = toDateTimeLocal(event.endDate);
      document.getElementById("eventSkinCost").value = event.skinTokens;
      document.getElementById("eventSkinTokenRule").textContent =
        "Cada giro rende " + (event.spinTokens + (event.bonusTokensPerSpin || 0)) + " " + event.tokenName + ".";
      document.getElementById("eventSkinSpinRule").textContent =
        "Giro normal: " + event.spinDiamonds + " diamantes.";
      document.getElementById("eventSkinDiscountRule").textContent =
        "Desconto: " + event.discountDiamonds + " diamantes · " +
        event.discountedSpinsPerDay + " giro(s) por dia.";
      document.getElementById("eventSkinDiscountsToday").value = Math.min(
        event.discountedSpinsPerDay,
        event.maxSpinsPerDay === null ? event.discountedSpinsPerDay : event.maxSpinsPerDay
      );
      updateEventDaysStatus();
      hideEventSkinResult();
    }

    function hideEventSkinResult() {
      document.getElementById("eventSkinResult").hidden = true;
    }

    function getEventDays() {
      const endValue = document.getElementById("eventSkinEndDate").value;
      if (endValue) {
        const endDate = new Date(endValue);
        if (Number.isNaN(endDate.getTime())) return {error:"Informe uma data e hora de término válidas."};
        const remainingMs = endDate.getTime() - Date.now();
        const days = Math.max(0, Math.ceil(remainingMs / 86400000));
        if (days > 365) return {error:"A data de término precisa estar dentro dos próximos 365 dias."};
        return {
          days,
          endDate,
          automatic:true
        };
      }

      const daysInput = document.getElementById("eventSkinDays").value.trim();
      if (daysInput === "") return {error:"Informe quantos dias faltam para o evento terminar."};
      const days = Number(daysInput);
      if (!Number.isInteger(days) || days < 0 || days > 365) {
        return {error:"Informe um número inteiro entre 0 e 365 dias."};
      }
      return {days, endDate:null, automatic:false};
    }

    function updateEventDaysStatus() {
      const status = document.getElementById("eventSkinDaysStatus");
      const timing = getEventDays();
      status.classList.remove("warning", "success");
      if (timing.error) {
        status.classList.add("warning");
        status.textContent = "⚠️ Informe quantos dias faltam para o evento terminar. Esse dado é necessário para calcular corretamente quantos descontos diários você ainda poderá utilizar.";
        return;
      }
      status.classList.add("success");
      if (timing.endDate) {
        status.textContent = "📅 O evento termina em " + timing.days + (timing.days === 1 ? " dia" : " dias") +
          " · ⏱️ Termina em: " + formatEventDate(timing.endDate);
      } else {
        status.textContent = "📅 Dias restantes informados: " + timing.days +
          " · Data de término não cadastrada para este evento.";
      }
    }

    function showEventSkinError(message) {
      const result = document.getElementById("eventSkinResult");
      result.hidden = false;
      result.classList.remove("success", "impossible");
      result.classList.add("warning");
      document.getElementById("eventSkinResultTitle").textContent = "⚠️ Não foi possível calcular";
      document.getElementById("eventSkinSummary").textContent = message;
      document.getElementById("eventSkinPlan").textContent = "";
      document.getElementById("eventSkinTimeline").textContent = "";
    }

    function calculateEventSkin() {
      const event = selectedEvent();
      const timing = getEventDays();
      const skinCostInput = document.getElementById("eventSkinCost").value.trim();
      const tokensInput = document.getElementById("eventSkinOwned").value.trim();
      const diamondsInput = document.getElementById("eventSkinDiamonds").value.trim();
      const discountsTodayInput = document.getElementById("eventSkinDiscountsToday").value.trim();
      const skinCost = Number(skinCostInput);
      const tokensOwned = Number(tokensInput);
      const diamondsOwned = Number(diamondsInput);
      const discountsToday = Number(discountsTodayInput);
      const skinName = document.getElementById("eventSkinName").value.trim() || "Skin desejada";
      const result = document.getElementById("eventSkinResult");
      const summary = document.getElementById("eventSkinSummary");
      const plan = document.getElementById("eventSkinPlan");
      const timeline = document.getElementById("eventSkinTimeline");

      if (timing.error) {
        showEventSkinError("⚠️ Informe quantos dias faltam para o evento terminar. Esse dado é necessário para calcular corretamente quantos descontos diários você ainda poderá utilizar.");
        document.getElementById("eventSkinDays").focus();
        return;
      }

      if (!Number.isInteger(event.skinTokens) || event.skinTokens < 0 ||
          !Number.isInteger(event.spinTokens) || event.spinTokens <= 0 ||
          !Number.isInteger(event.spinDiamonds) || event.spinDiamonds < 0 ||
          !Number.isInteger(event.discountDiamonds) || event.discountDiamonds < 0 ||
          event.discountDiamonds > event.spinDiamonds ||
          !Number.isInteger(event.discountedSpinsPerDay) || event.discountedSpinsPerDay < 0 ||
          (event.maxSpinsPerDay !== null && (!Number.isInteger(event.maxSpinsPerDay) || event.maxSpinsPerDay <= 0)) ||
          skinCostInput === "" || tokensInput === "" || diamondsInput === "" || discountsTodayInput === "" ||
          !Number.isInteger(skinCost) || skinCost < 0 ||
          !Number.isInteger(tokensOwned) || tokensOwned < 0 ||
          !Number.isInteger(diamondsOwned) || diamondsOwned < 0 ||
          !Number.isInteger(discountsToday) || discountsToday < 0 ||
          discountsToday > Math.min(event.discountedSpinsPerDay,
            event.maxSpinsPerDay === null ? event.discountedSpinsPerDay : event.maxSpinsPerDay)) {
        showEventSkinError("Revise os valores: tokens, diamantes e descontos de hoje devem ser inteiros válidos. O desconto disponível hoje não pode ultrapassar o limite diário do evento.");
        return;
      }

      result.hidden = false;
      result.classList.remove("success", "warning", "impossible");
      summary.textContent = "";
      plan.textContent = "";
      timeline.textContent = "";
      summary.append(
        eventSkinMetric("🎨 Skin desejada", skinName),
        eventSkinMetric("🪙 Tokens atuais", tokensOwned.toLocaleString("pt-BR") + " " + event.tokenName),
        eventSkinMetric("🎯 Tokens necessários", skinCost.toLocaleString("pt-BR") + " " + event.tokenName),
        eventSkinMetric("📅 Dias restantes", timing.days.toLocaleString("pt-BR"))
      );

      if (tokensOwned >= skinCost) {
        result.classList.add("success");
        document.getElementById("eventSkinResultTitle").textContent = "🟢 Você já possui tokens suficientes";
        summary.append(eventSkinMetric("📉 Tokens faltantes", "0"),
          eventSkinMetric("🎰 Giros necessários", "0"),
          eventSkinMetric("💎 Custo total", "0 diamantes"));
        plan.textContent = "Você já possui tokens suficientes para resgatar esta skin. Não precisa fazer giros.";
        return;
      }

      const missingTokens = skinCost - tokensOwned;
      const tokensPerSpin = event.spinTokens + (event.bonusTokensPerSpin || 0);
      const spinsNeeded = Math.ceil(missingTokens / tokensPerSpin);
      const dailyLimit = event.maxSpinsPerDay === null ? Infinity : event.maxSpinsPerDay;
      const dailyDiscountLimit = Math.min(event.discountedSpinsPerDay, dailyLimit);
      const discountsAvailable = timing.days === 0 ? 0 :
        Math.min(dailyDiscountLimit, discountsToday) +
        Math.max(0, timing.days - 1) * dailyDiscountLimit;
      const spinsPossibleByTime = timing.days === 0 ? 0 :
        (Number.isFinite(dailyLimit) ? timing.days * dailyLimit : Infinity);
      const spinsWithinTime = Math.min(spinsNeeded, spinsPossibleByTime);
      const discountSpins = Math.min(spinsWithinTime, discountsAvailable);
      const normalSpins = spinsWithinTime - discountSpins;
      const discountedCost = discountSpins * event.discountDiamonds;
      const normalCost = normalSpins * event.spinDiamonds;
      const totalCost = discountedCost + normalCost;
      const normalReferenceCost = spinsWithinTime * event.spinDiamonds;
      const estimatedSavings = normalReferenceCost - totalCost;
      const tokensObtainableInTime = spinsWithinTime * tokensPerSpin;
      const tokensAfterTimePlan = tokensOwned + tokensObtainableInTime;
      const tokensStillNeededAfterTime = Math.max(0, skinCost - tokensAfterTimePlan);
      const schedule = eventSkinSchedule(event, timing.days, spinsWithinTime, discountsToday);
      const timeIsEnough = spinsNeeded <= spinsPossibleByTime;
      const discountMessage = discountSpins === spinsWithinTime
        ? "🟢 Você consegue completar a quantidade necessária utilizando apenas os giros com desconto."
        : "🟡 Os descontos disponíveis não são suficientes para todos os giros necessários.";

      summary.append(
        eventSkinMetric("📉 Tokens faltantes", missingTokens.toLocaleString("pt-BR") + " " + event.tokenName),
        eventSkinMetric("🎰 Giros necessários", spinsNeeded.toLocaleString("pt-BR")),
        ...(timing.days > 0 ? [eventSkinMetric("📆 Giros necessários por dia", Math.ceil(spinsNeeded / timing.days).toLocaleString("pt-BR"))] : []),
        eventSkinMetric("🎟️ Descontos disponíveis", discountsAvailable.toLocaleString("pt-BR")),
        eventSkinMetric("🎟️ Giros com desconto", discountSpins.toLocaleString("pt-BR")),
        eventSkinMetric("🎰 Giros normais", normalSpins.toLocaleString("pt-BR")),
        eventSkinMetric("💸 Custo dos giros com desconto", discountedCost.toLocaleString("pt-BR") + " diamantes"),
        eventSkinMetric("💸 Custo dos giros normais", normalCost.toLocaleString("pt-BR") + " diamantes"),
        eventSkinMetric("💎 Custo total estimado", totalCost.toLocaleString("pt-BR") + " diamantes"),
        eventSkinMetric(timeIsEnough ? "💸 Custo sem descontos" : "💸 Custo normal dos giros possíveis",
          normalReferenceCost.toLocaleString("pt-BR") + " diamantes"),
        eventSkinMetric("💰 Economia estimada", estimatedSavings.toLocaleString("pt-BR") + " diamantes"),
        eventSkinMetric("💰 Seus diamantes", diamondsOwned.toLocaleString("pt-BR") + " diamantes")
      );

      if (!timeIsEnough) {
        result.classList.add("impossible");
        document.getElementById("eventSkinResultTitle").textContent =
          "🔴 O tempo restante do evento não é suficiente para alcançar esta skin com a estratégia atual.";
        plan.textContent = "Em " + timing.days + (timing.days === 1 ? " dia, você pode fazer " : " dias, você pode fazer ") +
          spinsWithinTime.toLocaleString("pt-BR") + " giro(s), obter " +
          tokensObtainableInTime.toLocaleString("pt-BR") + " " + event.tokenName +
          " e terminar com " + tokensStillNeededAfterTime.toLocaleString("pt-BR") +
          " " + event.tokenName + " ainda faltando. O custo dos giros possíveis é " +
          totalCost.toLocaleString("pt-BR") + " diamantes.";
        renderEventSkinTimeline(timeline, schedule, tokensOwned, skinCost, event);
        return;
      }

      const discountedAffordable = event.discountDiamonds === 0 ? discountSpins :
        Math.min(discountSpins, Math.floor(diamondsOwned / event.discountDiamonds));
      const diamondsAfterDiscounts = diamondsOwned - discountedAffordable * event.discountDiamonds;
      const normalAffordable = event.spinDiamonds === 0 ? normalSpins :
        Math.min(normalSpins, Math.floor(diamondsAfterDiscounts / event.spinDiamonds));
      const affordableSpins = discountedAffordable + normalAffordable;
      const remainingTokensWithBudget = Math.max(0, missingTokens - affordableSpins * tokensPerSpin);

      if (diamondsOwned >= totalCost) {
        result.classList.add("success");
        document.getElementById("eventSkinResultTitle").textContent = discountSpins === spinsWithinTime
          ? "🟢 Dá para conseguir a skin só com giros com desconto"
          : "🟢 É possível conseguir a skin";
        plan.append(
          document.createTextNode(discountMessage + " "),
          document.createTextNode("Estratégia: " + discountSpins + " giro(s) com desconto × " +
            event.discountDiamonds + " + " + normalSpins + " giro(s) normal(is) × " +
            event.spinDiamonds + " = " + totalCost.toLocaleString("pt-BR") + " diamantes.")
        );
      } else {
        result.classList.add("warning");
        document.getElementById("eventSkinResultTitle").textContent =
          "🟡 Os diamantes disponíveis não cobrem todos os giros";
        plan.append(
          document.createTextNode(discountMessage + " "),
          document.createTextNode("Com seu saldo, você consegue " + affordableSpins.toLocaleString("pt-BR") +
            " giro(s), obter " + (affordableSpins * tokensPerSpin).toLocaleString("pt-BR") +
            " " + event.tokenName + " e ainda faltarão " +
            remainingTokensWithBudget.toLocaleString("pt-BR") + " " + event.tokenName +
            ". Para todos os giros estimados, faltam " +
            (totalCost - diamondsOwned).toLocaleString("pt-BR") + " diamantes.")
        );
      }

      renderEventSkinTimeline(timeline, schedule, tokensOwned, skinCost, event);
    }

    select.addEventListener("change", () => {
      document.getElementById("eventSkinDays").value = "";
      updateEventDescription();
    });
    ["eventSkinEndDate", "eventSkinDays"].forEach(id => {
      document.getElementById(id).addEventListener("input", () => {
        updateEventDaysStatus();
        hideEventSkinResult();
      });
    });
    ["eventSkinCost", "eventSkinOwned", "eventSkinDiamonds", "eventSkinDiscountsToday", "eventSkinName"].forEach(id => {
      document.getElementById(id).addEventListener("input", hideEventSkinResult);
    });
    document.getElementById("eventSkinCalculate").addEventListener("click", calculateEventSkin);
    updateEventDescription();
  }

  async function loadTools() {
    try {
      const response = await fetch("/static/views/tools.html");
      if (!response.ok) throw new Error("Falha ao carregar ferramentas: HTTP " + response.status);
      content.innerHTML = await response.text();
      content.classList.remove("tools-loading");

      content.querySelectorAll("[data-tool]").forEach(button => {
        button.addEventListener("click", () => showTool(button.dataset.tool));
      });
      content.querySelectorAll("[data-back-tools]").forEach(button => {
        button.addEventListener("click", showMenu);
      });

      ["wrN", "wrW", "wrT", "wrFuture", "wrFloor"].forEach(id => {
        document.getElementById(id).addEventListener("input", updateWinRate);
      });
      document.getElementById("wrReset").addEventListener("click", resetWinRate);
      updateWinRate();
      ["stN", "stW", "stD", "stUp", "stDown"].forEach(id => {
        document.getElementById(id).addEventListener("input", updateStars);
      });
      ["skD", "skPD", "skPR"].forEach(id => {
        document.getElementById(id).addEventListener("input", updateSkinCost);
      });
      setupEventSkinCalculator();
      toolsReadyResolve();
    } catch (error) {
      console.error(error);
      showLoadError();
      toolsReadyResolve();
    }
  }

  window.SocietyTools = {
    async openWinRate() {
      await toolsReady;
      const input = document.getElementById("wrN");
      const panel = input && input.closest(".tool-panel");
      if (!panel) return;
      showTool(panel.id.replace(/^tool-/, ""));
      panel.scrollIntoView({behavior: "smooth", block: "start"});
      input.focus({preventScroll: true});
    }
  };

  loadTools();
})();