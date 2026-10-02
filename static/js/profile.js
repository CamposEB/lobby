/* Reusable profile presentation and editor interactions. */
(() => {
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_AVATAR_DATA_LENGTH = 120000;
  const MAX_BANNER_DATA_LENGTH = 350000;
  const defaultAccent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  let context = null;
  let draftAvatar = "";
  let draftBanner = "";
  let profile = {};

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function initials(name, username) {
    const source = (name || username || "?").trim();
    return source.slice(0, 1).toLocaleUpperCase("pt-BR") || "?";
  }

  function createAvatar(data, className) {
    const wrapper = node("span", null, className || "user-avatar");
    const name = data.display_name || data.display || data.username || data.nick || "Jogador";
    const image = data.avatar || "";
    wrapper.setAttribute("role", "img");
    wrapper.setAttribute("aria-label", "Foto de perfil de " + name);
    if (/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) && image.length <= MAX_AVATAR_DATA_LENGTH) {
      const photo = node("img");
      photo.src = image;
      photo.alt = "";
      photo.loading = "lazy";
      wrapper.append(photo);
    } else {
      wrapper.textContent = initials(name, data.username || data.nick);
    }
    return wrapper;
  }

  function setAvatar(container, data, className) {
    if (!container) return;
    const avatar = createAvatar(data, className || container.className);
    container.replaceChildren(...avatar.childNodes);
    container.setAttribute("role", "img");
    container.setAttribute("aria-label", avatar.getAttribute("aria-label"));
    container.classList.toggle("has-photo", Boolean(data.avatar));
  }

  function applyBanner(container, image) {
    if (!container) return;
    container.style.backgroundImage = image && image.length <= MAX_BANNER_DATA_LENGTH
      ? "linear-gradient(180deg, rgba(var(--bg-rgb), .08), rgba(var(--bg-rgb), .72)), url(\"" + image + "\")"
      : "";
    container.classList.toggle("has-banner", Boolean(image && image.length <= MAX_BANNER_DATA_LENGTH));
  }

  function formatJoined(value) {
    if (!value) return "Data de entrada não registrada";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data de entrada não registrada";
    return "Na comunidade desde " + new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "long", year: "numeric"
    }).format(date);
  }

  function formatTime(value) {
    const date = new Date(Number(value) * 1000);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}).format(date);
  }

  function renderDetails() {
    const box = document.getElementById("profileGameDetails");
    box.replaceChildren();
    [
      ["Rank", profile.rank],
      ["Função principal", profile.role],
      ["Herói principal", profile.hero],
      ["ID no jogo", profile.gid]
    ].forEach(([label, value]) => {
      if (value) {
        const item = node("span", null, "profile-game-tag");
        item.append(node("small", label), node("b", value));
        box.append(item);
      }
    });
    if (!box.childElementCount) box.append(node("p", "Adicione seus dados de jogo ao editar o perfil.", "profile-empty"));
  }

  function renderStats() {
    const section = document.getElementById("profileStatsSection");
    const container = document.getElementById("profileStats");
    const stats = profile.stats || {};
    section.hidden = profile.show_stats === false;
    container.replaceChildren();
    if (section.hidden) return;
    [
      ["🪙", "Moedas", Number.isFinite(Number(stats.coins)) ? Number(stats.coins).toLocaleString("pt-BR") : "—"],
      ["🧠", "Quizzes respondidos", Number.isFinite(Number(stats.quizzes)) ? Number(stats.quizzes).toLocaleString("pt-BR") : "—"]
    ].forEach(([icon, label, value]) => {
      const card = node("article", null, "profile-stat-card");
      card.append(node("span", icon, "profile-stat-icon"), node("span", label, "profile-stat-label"), node("b", value));
      container.append(card);
    });
    container.append(node("p", "Partidas e Win Rate ainda não são registrados pelo site.", "profile-data-note"));
  }

  function renderAchievements() {
    const section = document.getElementById("profileAchievementsSection");
    const container = document.getElementById("profileAchievements");
    const achievements = profile.achievements || [];
    section.hidden = profile.show_stats === false;
    container.replaceChildren();
    if (section.hidden) return;
    if (!achievements.length) {
      container.append(node("p", "Responda ao quiz diário para desbloquear sua primeira conquista.", "profile-empty"));
      return;
    }
    achievements.forEach(badge => {
      const item = node("article", null, "profile-badge");
      item.append(node("span", badge.icon, "profile-badge-icon"), node("b", badge.name));
      container.append(item);
    });
  }

  function renderActivity() {
    const section = document.getElementById("profileActivitySection");
    const container = document.getElementById("profileActivity");
    const activity = profile.activity || [];
    section.hidden = profile.show_activity === false;
    container.replaceChildren();
    if (section.hidden) return;
    if (!activity.length) {
      container.append(node("p", "Você ainda não possui atividades recentes.", "profile-empty"));
      return;
    }
    activity.forEach(entry => {
      const item = node("article", null, "profile-activity-item");
      item.append(node("span", entry.kind === "quiz" ? "🧠" : entry.kind === "room" ? "🎮" : "✨", "profile-activity-icon"));
      const content = node("div");
      content.append(node("b", entry.detail), node("time", formatTime(entry.ts)));
      item.append(content);
      container.append(item);
    });
  }

  function renderProfile(nextProfile, username) {
    profile = nextProfile || {};
    const displayName = profile.display_name || username || "Jogador";
    document.getElementById("profileDisplayName").textContent = displayName;
    document.getElementById("profileUsername").textContent = "@" + (profile.username || username || "jogador");
    document.getElementById("profileBio").textContent = profile.bio || "Adicione uma bio para que a comunidade conheça você.";
    document.getElementById("profileJoined").textContent = formatJoined(profile.joined_at);
    document.getElementById("profileStatus").replaceChildren(node("i"), document.createTextNode(" Online"));
    document.getElementById("profileTitle").textContent = profile.title || "";
    document.getElementById("profileTitle").hidden = !profile.title;
    const roles = document.getElementById("profileCommunityRoles");
    roles.replaceChildren();
    (Array.isArray(profile.community_roles) ? profile.community_roles : []).forEach(role => {
      const badge = node("span", role, "profile-community-role");
      badge.dataset.role = role.toLocaleLowerCase("pt-BR");
      roles.append(badge);
    });
    roles.hidden = roles.childElementCount === 0;
    const card = document.getElementById("profileCard");
    card.style.setProperty("--profile-accent", profile.accent || defaultAccent());
    card.dataset.frame = profile.frame || "default";
    document.querySelector(".profile-page").dataset.theme = profile.theme || "classic";
    document.querySelector(".profile-page").style.setProperty("--profile-accent", profile.accent || defaultAccent());
    setAvatar(document.getElementById("profileAvatar"), profile, "profile-avatar");
    applyBanner(document.getElementById("profileBanner"), profile.banner || "");
    const sidebarAvatar = document.getElementById("sidebarAvatar");
    setAvatar(sidebarAvatar, profile, "sidebar-avatar");
    document.getElementById("profileNavAvatar").replaceChildren(
      createAvatar(profile, "nav-profile-avatar").childNodes[0] || document.createTextNode(initials(displayName, profile.username))
    );
    document.getElementById("sidebarDisplayName").textContent = displayName;
    document.getElementById("sidebarUsername").textContent = "@" + (profile.username || username || "jogador");
    renderDetails();
    renderStats();
    renderAchievements();
    renderActivity();
    document.getElementById("settingsDisplayName").textContent = displayName;
    document.getElementById("settingsUsername").textContent = "@" + (profile.username || username || "jogador");
    document.getElementById("cfgProfilePrivate").checked = Boolean(profile.is_private);
    document.getElementById("cfgShowStats").checked = profile.show_stats !== false;
    document.getElementById("cfgShowActivity").checked = profile.show_activity !== false;
    const notifications = profile.notifications || {};
    document.getElementById("notifyMessages").checked = notifications.messages !== false;
    document.getElementById("notifyInvites").checked = notifications.invites !== false;
    document.getElementById("notifyEvents").checked = notifications.events !== false;
    document.getElementById("notifyActivity").checked = notifications.activity !== false;
    syncDraftPreviews();
  }

  function syncDraftPreviews() {
    const name = document.getElementById("profileDisplayNameInput").value || profile.display_name || "Jogador";
    const username = profile.username || "";
    setAvatar(document.getElementById("profilePreviewAvatar"), {
      display_name: name, username, avatar: draftAvatar
    }, "profile-avatar profile-preview-avatar");
    applyBanner(document.getElementById("profilePreviewBanner"), draftBanner);
  }

  function openEditor() {
    const form = document.getElementById("profileForm");
    form.reset();
    document.getElementById("profileFormMessage").textContent = "";
    document.getElementById("profileDisplayNameInput").value = profile.display_name || "";
    document.getElementById("profileUsernameInput").value = "@" + (profile.username || "");
    document.getElementById("pRank").value = profile.rank || "";
    document.getElementById("pRole").value = profile.role || "Qualquer";
    document.getElementById("pHero").value = profile.hero || "";
    document.getElementById("pGid").value = profile.gid || "";
    document.getElementById("pBio").value = profile.bio || "";
    document.getElementById("profileTitleInput").value = profile.title || "";
    document.getElementById("profileAccentInput").value = profile.accent || defaultAccent();
    document.getElementById("profileFrameInput").value = profile.frame || "default";
    document.getElementById("profileThemeInput").value = profile.theme || "classic";
    document.getElementById("profilePrivateInput").checked = Boolean(profile.is_private);
    document.getElementById("profileShowStatsInput").checked = profile.show_stats !== false;
    document.getElementById("profileShowActivityInput").checked = profile.show_activity !== false;
    document.getElementById("profileAvatarFile").value = "";
    document.getElementById("profileBannerFile").value = "";
    draftAvatar = profile.avatar || "";
    draftBanner = profile.banner || "";
    syncDraftPreviews();
    document.getElementById("profileEditor").showModal();
  }

  function imageData(file, width, height, maxDataLength) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Selecione um arquivo de imagem."));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        reject(new Error("A imagem deve ter no máximo 8 MB."));
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, width / image.naturalWidth, height / image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context2d = canvas.getContext("2d");
        if (!context2d) {
          reject(new Error("Não foi possível processar esta imagem."));
          return;
        }
        context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) {
            reject(new Error("Não foi possível otimizar esta imagem."));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || "");
            if (result.length > maxDataLength) {
              reject(new Error("A imagem otimizada ainda ficou grande demais. Escolha outra imagem."));
            } else {
              resolve(result);
            }
          };
          reader.onerror = () => reject(new Error("Não foi possível ler esta imagem."));
          reader.readAsDataURL(blob);
        }, "image/jpeg", .78);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("O arquivo selecionado não pôde ser aberto como imagem."));
      };
      image.src = objectUrl;
    });
  }

  function showImageError(message) {
    document.getElementById("profileFormMessage").textContent = message;
    document.getElementById("profileFormMessage").classList.add("is-error");
  }

  function saveProfile(event) {
    event.preventDefault();
    const displayName = document.getElementById("profileDisplayNameInput").value.trim();
    if (!displayName) {
      showImageError("Informe um nome de exibição.");
      document.getElementById("profileDisplayNameInput").focus();
      return;
    }
    document.getElementById("profileFormMessage").textContent = "Salvando perfil…";
    document.getElementById("profileFormMessage").classList.remove("is-error");
    if (!context.send({
      t: "profile_set",
      display_name: displayName,
      rank: document.getElementById("pRank").value,
      role: document.getElementById("pRole").value,
      hero: document.getElementById("pHero").value,
      gid: document.getElementById("pGid").value,
      bio: document.getElementById("pBio").value,
      title: document.getElementById("profileTitleInput").value,
      accent: document.getElementById("profileAccentInput").value,
      frame: document.getElementById("profileFrameInput").value,
      theme: document.getElementById("profileThemeInput").value,
      avatar: draftAvatar,
      banner: draftBanner,
      is_private: document.getElementById("profilePrivateInput").checked,
      show_stats: document.getElementById("profileShowStatsInput").checked,
      show_activity: document.getElementById("profileShowActivityInput").checked
    })) showImageError("A conexão caiu. Reconecte-se antes de salvar o perfil.");
  }

  function savePrivacy() {
    const message = document.getElementById("privacySettingsMessage");
    message.textContent = "Salvando…";
    message.classList.remove("is-error");
    if (!context.send({
      t: "settings_set",
      notifications: getNotifications(),
      is_private: document.getElementById("cfgProfilePrivate").checked,
      show_stats: document.getElementById("cfgShowStats").checked,
      show_activity: document.getElementById("cfgShowActivity").checked
    })) {
      message.textContent = "A conexão caiu. Reconecte-se antes de salvar as preferências.";
      message.classList.add("is-error");
    }
  }

  function getNotifications() {
    return {
      messages: document.getElementById("notifyMessages").checked,
      invites: document.getElementById("notifyInvites").checked,
      events: document.getElementById("notifyEvents").checked,
      activity: document.getElementById("notifyActivity").checked
    };
  }

  function saveNotifications() {
    const message = document.getElementById("notificationSettingsMessage");
    message.textContent = "Salvando…";
    message.classList.remove("is-error");
    if (!context.send({
      t: "settings_set",
      notifications: getNotifications(),
      is_private: document.getElementById("cfgProfilePrivate").checked,
      show_stats: document.getElementById("cfgShowStats").checked,
      show_activity: document.getElementById("cfgShowActivity").checked
    })) {
      message.textContent = "A conexão caiu. Reconecte-se antes de salvar as preferências.";
      message.classList.add("is-error");
    }
  }

  function submitPasswordChange(event) {
    event.preventDefault();
    const current = document.getElementById("passwordCurrent").value;
    const next = document.getElementById("passwordNew").value;
    const confirmation = document.getElementById("passwordConfirm").value;
    const message = document.getElementById("passwordChangeMessage");
    message.classList.remove("is-error");
    if (next.length < 10 || next.length > 128) {
      message.textContent = "A nova senha deve ter entre 10 e 128 caracteres.";
      message.classList.add("is-error");
      return;
    }
    if (next !== confirmation) {
      message.textContent = "A confirmação não corresponde à nova senha.";
      message.classList.add("is-error");
      document.getElementById("passwordConfirm").focus();
      return;
    }
    message.textContent = "Alterando senha…";
    if (!context.send({t:"password_change", current, new:next})) {
      message.textContent = "A conexão caiu. Reconecte-se antes de alterar sua senha.";
      message.classList.add("is-error");
    }
  }

  function mount(options) {
    context = options;
    document.getElementById("profileEditButton").addEventListener("click", openEditor);
    document.getElementById("settingsEditProfile").addEventListener("click", () => {
      options.openProfile();
      openEditor();
    });
    document.getElementById("profileEditorClose").addEventListener("click", () => document.getElementById("profileEditor").close());
    document.getElementById("profileCancelButton").addEventListener("click", () => document.getElementById("profileEditor").close());
    document.getElementById("profileForm").addEventListener("submit", saveProfile);
    document.getElementById("profileDisplayNameInput").addEventListener("input", syncDraftPreviews);
    ["profileAccentInput", "profileFrameInput"].forEach(id => {
      document.getElementById(id).addEventListener("input", () => {
        const editor = document.getElementById("profileEditor");
        editor.style.setProperty("--profile-accent", document.getElementById("profileAccentInput").value);
      });
    });
    document.getElementById("profileAvatarFile").addEventListener("change", async event => {
      try {
        draftAvatar = await imageData(event.target.files[0], 360, 360, MAX_AVATAR_DATA_LENGTH);
        document.getElementById("profileFormMessage").textContent = "";
        syncDraftPreviews();
      } catch (error) {
        showImageError(error.message);
        event.target.value = "";
      }
    });
    document.getElementById("profileBannerFile").addEventListener("change", async event => {
      try {
        draftBanner = await imageData(event.target.files[0], 1280, 460, MAX_BANNER_DATA_LENGTH);
        document.getElementById("profileFormMessage").textContent = "";
        syncDraftPreviews();
      } catch (error) {
        showImageError(error.message);
        event.target.value = "";
      }
    });
    document.getElementById("profileRemoveAvatar").addEventListener("click", () => {
      draftAvatar = "";
      document.getElementById("profileAvatarFile").value = "";
      syncDraftPreviews();
    });
    document.getElementById("profileRemoveBanner").addEventListener("click", () => {
      draftBanner = "";
      document.getElementById("profileBannerFile").value = "";
      syncDraftPreviews();
    });
    document.getElementById("savePrivacySettings").addEventListener("click", savePrivacy);
    document.getElementById("saveNotificationSettings").addEventListener("click", saveNotifications);
    document.getElementById("passwordChangeForm").addEventListener("submit", submitPasswordChange);
    document.querySelectorAll("[data-toggle-password]").forEach(button => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.togglePassword);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Ocultar" : "Mostrar";
        button.setAttribute("aria-label", (show ? "Ocultar " : "Mostrar ") + button.closest("label").firstChild.textContent.trim());
      });
    });
  }

  function setProfile(nextProfile, username) {
    renderProfile(nextProfile, username);
    if (document.getElementById("profileEditor").open) {
      document.getElementById("profileEditor").close();
      context.toast("Perfil atualizado com sucesso.");
    }
  }

  function settingsSaved(nextProfile) {
    renderProfile(nextProfile, context.getUsername());
    document.getElementById("privacySettingsMessage").textContent = "Preferências salvas.";
    document.getElementById("notificationSettingsMessage").textContent = "Preferências salvas.";
    document.getElementById("privacySettingsMessage").classList.remove("is-error");
    document.getElementById("notificationSettingsMessage").classList.remove("is-error");
  }

  function showError(targetId, message) {
    const target = document.getElementById(targetId);
    target.textContent = message;
    target.classList.add("is-error");
  }

  window.ProfileUI = {createAvatar, mount, renderProfile, setProfile, settingsSaved, showError};
})();
