    } else if (b.action === "setStatus") {
      const id = str(b.id, 64);
      if (!/^[\w-]+$/.test(id)) return res.status(400).json({ error: "id" });
      const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : "", stage = STAGES.includes(b.stage) ? b.stage : "", note = str(b.note, 500);
      const prev = d.status[id] || { log: [] };
      const log = [...(prev.log || []), { at: now, outcome, stage, note }].slice(-30);
      d.status[id] = { outcome, stage, note, at: now, log };
    } else if (b.action === "setAddress") {
      const id = str(b.id, 64);
      if (!/^[\w-]+$/.test(id)) return res.status(400).json({ error: "id" });
      const e = {};
      ["division", "district", "upazila", "union", "area", "postOffice", "postCode"].forEach((k) => { e[k] = str(b[k], 120); });
      d.edits = d.edits || {};
      d.edits[id] = e;
    } else if (b.action === "clearAddress") {
      if (d.edits) delete d.edits[str(b.id, 64)];
    } else if (b.action === "clearStatus") {
      delete d.status[str(b.id, 64)];
    } else return res.status(400).json({ error: "action" });

    await save(d);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "server" });
  }
};
