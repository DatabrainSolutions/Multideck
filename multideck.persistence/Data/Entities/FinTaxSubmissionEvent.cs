using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinTaxSubmissionEvent
{
    public Guid FintaxSubId { get; set; }

    public Guid FintaxSubReturnId { get; set; }

    public string FintaxSubProviderCode { get; set; } = null!;

    public string FintaxSubStatusCode { get; set; } = null!;

    public DateTime FintaxSubSubmittedAt { get; set; }

    public Guid? FintaxSubSubmittedBy { get; set; }

    public string FintaxSubRequestJson { get; set; } = null!;

    public string FintaxSubResponseJson { get; set; } = null!;

    public string? FintaxSubErrorMessage { get; set; }

    public virtual FinTaxReturn FintaxSubReturn { get; set; } = null!;

    public virtual CmpUser? FintaxSubSubmittedByNavigation { get; set; }
}
