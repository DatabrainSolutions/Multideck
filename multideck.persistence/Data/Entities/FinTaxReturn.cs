using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinTaxReturn
{
    public Guid FintaxReturnId { get; set; }

    public Guid FintaxReturnPeriodId { get; set; }

    public string FintaxReturnStatusCode { get; set; } = null!;

    public decimal FintaxReturnTotalTaxDue { get; set; }

    public decimal FintaxReturnTotalTaxRecoverable { get; set; }

    public decimal FintaxReturnNetTaxPayable { get; set; }

    public DateTime? FintaxReturnApprovedAt { get; set; }

    public Guid? FintaxReturnApprovedBy { get; set; }

    public DateTime FintaxReturnCreatedAt { get; set; }

    public virtual ICollection<FinTaxReturnLine> FinTaxReturnLines { get; set; } = new List<FinTaxReturnLine>();

    public virtual ICollection<FinTaxSubmissionEvent> FinTaxSubmissionEvents { get; set; } = new List<FinTaxSubmissionEvent>();

    public virtual CmpUser? FintaxReturnApprovedByNavigation { get; set; }

    public virtual FinTaxReturnPeriod FintaxReturnPeriod { get; set; } = null!;
}
