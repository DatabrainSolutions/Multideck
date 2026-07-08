using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceLicenseUsage
{
    public Guid TcelicUseId { get; set; }

    public Guid TcelicUseLicenseId { get; set; }

    public Guid? TcelicUseLicenseLineId { get; set; }

    public Guid? TcelicUseJobId { get; set; }

    public Guid? TcelicUseJobCargoId { get; set; }

    public string? TcelicUseSourceRecordTypeCode { get; set; }

    public string? TcelicUseSourceTable { get; set; }

    public Guid? TcelicUseSourceId { get; set; }

    public string TcelicUseStatusCode { get; set; } = null!;

    public decimal TcelicUseQuantityUsed { get; set; }

    public decimal TcelicUseValueUsedAmount { get; set; }

    public string TcelicUseCurrencyCodeSnapshot { get; set; } = null!;

    public DateTime TcelicUseUsedAt { get; set; }

    public Guid? TcelicUseUsedBy { get; set; }

    public string? TcelicUseNotes { get; set; }

    public virtual JobHeader? TcelicUseJob { get; set; }

    public virtual JobCargo? TcelicUseJobCargo { get; set; }

    public virtual TceLicense TcelicUseLicense { get; set; } = null!;

    public virtual TceLicenseLine? TcelicUseLicenseLine { get; set; }

    public virtual SysWorkflowRecordType? TcelicUseSourceRecordTypeCodeNavigation { get; set; }

    public virtual CmpUser? TcelicUseUsedByNavigation { get; set; }
}
