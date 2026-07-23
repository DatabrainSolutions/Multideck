using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinExchangeRateImport
{
    public Guid FinrateImportId { get; set; }

    public Guid FinrateImportProviderId { get; set; }

    public string FinrateImportImportTypeCode { get; set; } = null!;

    public string FinrateImportStatusCode { get; set; } = null!;

    public DateOnly FinrateImportRateDateFrom { get; set; }

    public DateOnly FinrateImportRateDateTo { get; set; }

    public string? FinrateImportSourceUrl { get; set; }

    public string? FinrateImportSourceReference { get; set; }

    public string? FinrateImportFileHashSha256 { get; set; }

    public int FinrateImportRowCount { get; set; }

    public string FinrateImportRawPayloadJson { get; set; } = null!;

    public DateTime FinrateImportImportedAt { get; set; }

    public Guid? FinrateImportImportedBy { get; set; }

    public virtual ICollection<FinExchangeRate> FinExchangeRates { get; set; } = new List<FinExchangeRate>();

    public virtual CmpUser? FinrateImportImportedByNavigation { get; set; }

    public virtual FinExchangeRateProvider FinrateImportProvider { get; set; } = null!;
}
