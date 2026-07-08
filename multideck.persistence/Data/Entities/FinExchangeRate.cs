using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinExchangeRate
{
    public Guid FinrateId { get; set; }

    public Guid FinrateProviderId { get; set; }

    public Guid? FinrateImportId { get; set; }

    public string FinrateFromCurrencyCode { get; set; } = null!;

    public string FinrateToCurrencyCode { get; set; } = null!;

    public DateOnly FinrateRateDate { get; set; }

    public DateOnly FinrateValidFrom { get; set; }

    public DateOnly? FinrateValidTo { get; set; }

    public string FinrateRateTypeCode { get; set; } = null!;

    public decimal? FinrateMidRate { get; set; }

    public decimal? FinrateBuyRate { get; set; }

    public decimal? FinrateSellRate { get; set; }

    public string? FinrateSourceReference { get; set; }

    public bool FinrateIsOfficial { get; set; }

    public bool FinrateIsApproved { get; set; }

    public DateTime FinrateImportedAt { get; set; }

    public DateTime? FinrateApprovedAt { get; set; }

    public Guid? FinrateApprovedBy { get; set; }

    public virtual ICollection<FinChargeRoeapplication> FinChargeRoeapplications { get; set; } = new List<FinChargeRoeapplication>();

    public virtual ICollection<FinDocument> FinDocuments { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinJobRoeline> FinJobRoelines { get; set; } = new List<FinJobRoeline>();

    public virtual ICollection<FinRevaluationItem> FinRevaluationItems { get; set; } = new List<FinRevaluationItem>();

    public virtual ICollection<FinVesselRoeline> FinVesselRoelines { get; set; } = new List<FinVesselRoeline>();

    public virtual CmpUser? FinrateApprovedByNavigation { get; set; }

    public virtual FinExchangeRateImport? FinrateImport { get; set; }

    public virtual FinExchangeRateProvider FinrateProvider { get; set; } = null!;

    public virtual SysFinanceRoetype FinrateRateTypeCodeNavigation { get; set; } = null!;
}
