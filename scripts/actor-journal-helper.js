Hooks.once('setup', () => {
  game.settings.register("actor-journal-helper", "closeCharacterSheetOnJournalOpen", {
    name: "Close Character Sheet on Journal Open",
    hint: "When enabled, the character sheet will close when opening the journal from the button.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
  });
  
  game.settings.register("actor-journal-helper", "closeJournalPageEditorOnSave", {
    name: "Close Journal Page Editor on Save",
    hint: "When enabled, the ProseMirror journal page editor will close when saving changes.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
  });

  game.settings.register("actor-journal-helper", "useSocket", {
    name: "Automatic ownership updates for journal pages (Requires socketlib)",
    hint: "When enabled, ownership update will use socketlib. You must have Library - socketlib module activated.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });
});

Hooks.once('ready', async () => {
  const actorJournalEntry = game.journal.getName("Actor Journal");

  if (!actorJournalEntry) {
    await JournalEntry.create({
      name: "Actor Journal",
      ownership: {
        default: 3,
      }
    });
  }
});

let socket;

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule("actor-journal-helper");
  socket.register("updateOwnership", updateOwnership);
});

async function updateOwnership(journalEntryId, journalPageId, requesterUserId) {
  try {
    const journal = game.journal.get(journalEntryId);
    const journalPage = journal.getEmbeddedDocument("JournalEntryPage", journalPageId);

    if (journalPage) {
      const updateData = {
        "ownership": {
          ...journalPage.getFlag("core", "ownership"),
          [requesterUserId]: 3
        }
      };

      await journalPage.update(updateData);
      ui.notifications.info("Ownership updated successfully!");
    } else {
      ui.notifications.error("Journal page not found.");
    }
  } catch (error) {
    ui.notifications.error(`Error updating ownership: ${error}`);
  }
}

Hooks.on('renderActorSheet', (app, html, data) => {
  const header = html.find('.window-header');

  const buttonElement = $(`
    <a class="header-button control journal">
      <i class="fa fa-book-open"></i>
      ${game.i18n.localize('actor-journal-helper.journal-button')}
    </a>
  `);

  header.children().last().before(buttonElement);

  buttonElement.on('click', async (event) => {
    event.preventDefault();

    const closeOnJournalOpen = game.settings.get("actor-journal-helper", "closeCharacterSheetOnJournalOpen");
    const useSocket = game.settings.get("actor-journal-helper", "useSocket");

    let actorJournalEntry = game.journal.getName("Actor Journal");

    let actorJournalPage = actorJournalEntry.pages.find(page => {
      return page.name.includes(`(${app.actor.id})`);
    });

    if (!actorJournalPage) {
      const newPage = await game.journal.getName("Actor Journal").createEmbeddedDocuments("JournalEntryPage", [
        {
          name: `${app.actor.name} (${app.actor.id})`,
          text: {
            content: `<p>This journal entry is for @UUID[Actor.${app.actor.id}]{${app.actor.name}}.</p><p></p><p></p>`,
          },
          ownership: {
            default: 0,
            [game.userId]: 3,
          }
        },
      ]);

      newPage[0].sheet.render(true);
    } else if (actorJournalPage.ownership[game.userId] === 3) {
      actorJournalPage.sheet.render(true);
    } else if (useSocket) {
      await socket.executeAsGM("updateOwnership", actorJournalEntry._id, actorJournalPage._id, game.userId);
      actorJournalPage.sheet.render(true);
    } else {
      ui.notifications.warn(`Ask your GM for ownership of the journal page associated with this actor.`);
    }
    if (closeOnJournalOpen) {
      app.close();
    }
  });
});

let editorInstance;

Hooks.on('renderJournalTextPageSheet', (editor) => {
  editorInstance = editor;
});

Hooks.on('getProseMirrorMenuItems', (menu, config) => {
  const saveMenuItem = config.find(item => item.action === 'save');
  if (saveMenuItem) {
    saveMenuItem.cmd = () => {
      if (editorInstance) {
        editorInstance.close();
      }
    };
  }
});
