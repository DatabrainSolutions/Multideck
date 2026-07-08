using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAccountingDirection
{
    public string AccdirCode { get; set; } = null!;

    public string AccdirName { get; set; } = null!;

    public int AccdirSortOrder { get; set; }

    public bool AccdirIsActive { get; set; }

    public DateTime AccdirCreatedAt { get; set; }

    public virtual ICollection<AcciAccountMapping> AcciAccountMappings { get; set; } = new List<AcciAccountMapping>();

    public virtual ICollection<AcciChargeCodeMapping> AcciChargeCodeMappings { get; set; } = new List<AcciChargeCodeMapping>();

    public virtual ICollection<AcciSyncRun> AcciSyncRuns { get; set; } = new List<AcciSyncRun>();

    public virtual ICollection<AcciTaxCodeMapping> AcciTaxCodeMappings { get; set; } = new List<AcciTaxCodeMapping>();

    public virtual ICollection<SysAccountingDocumentType> SysAccountingDocumentTypes { get; set; } = new List<SysAccountingDocumentType>();
}
