using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateImportBatch
{
    public Guid RateimportId { get; set; }

    public Guid? RateimportContractId { get; set; }

    public Guid? RateimportContractVerId { get; set; }

    public string RateimportStatusCode { get; set; } = null!;

    public string RateimportSourceTypeCode { get; set; } = null!;

    public string? RateimportFileName { get; set; }

    public string? RateimportFileHashSha256 { get; set; }

    public string? RateimportStorageBucket { get; set; }

    public string? RateimportStoragePath { get; set; }

    public int RateimportRowCount { get; set; }

    public int RateimportErrorCount { get; set; }

    public int RateimportWarningCount { get; set; }

    public DateTime? RateimportStartedAt { get; set; }

    public DateTime? RateimportCompletedAt { get; set; }

    public string RateimportMetadataJson { get; set; } = null!;

    public DateTime RateimportCreatedAt { get; set; }

    public Guid? RateimportCreatedBy { get; set; }

    public virtual ICollection<RateImportRow> RateImportRows { get; set; } = new List<RateImportRow>();

    public virtual RateContract? RateimportContract { get; set; }

    public virtual RateContractVersion? RateimportContractVer { get; set; }

    public virtual CmpUser? RateimportCreatedByNavigation { get; set; }

    public virtual SysRateSourceType RateimportSourceTypeCodeNavigation { get; set; } = null!;

    public virtual SysRateImportStatus RateimportStatusCodeNavigation { get; set; } = null!;
}
