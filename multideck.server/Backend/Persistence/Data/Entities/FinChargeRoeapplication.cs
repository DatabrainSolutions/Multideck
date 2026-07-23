using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinChargeRoeapplication
{
    public Guid FinchargeRoeId { get; set; }

    public string FinchargeRoeSourceTable { get; set; } = null!;

    public Guid FinchargeRoeSourceId { get; set; }

    public Guid? FinchargeRoeJobId { get; set; }

    public Guid? FinchargeRoeChargeInId { get; set; }

    public Guid? FinchargeRoeChargeOutId { get; set; }

    public Guid? FinchargeRoeDocumentLineId { get; set; }

    public string FinchargeRoeFromCurrencyCode { get; set; } = null!;

    public string FinchargeRoeToCurrencyCode { get; set; } = null!;

    public string FinchargeRoeRoetypeCode { get; set; } = null!;

    public DateOnly FinchargeRoeRateDate { get; set; }

    public decimal FinchargeRoeRate { get; set; }

    public Guid? FinchargeRoeProviderRateId { get; set; }

    public Guid? FinchargeRoeJobRoelineId { get; set; }

    public Guid? FinchargeRoeVesselRoelineId { get; set; }

    public Guid? FinchargeRoeOverrideId { get; set; }

    public decimal FinchargeRoeSourceAmount { get; set; }

    public decimal FinchargeRoeCalculatedLocalAmount { get; set; }

    public DateTime FinchargeRoeAppliedAt { get; set; }

    public Guid? FinchargeRoeAppliedBy { get; set; }

    public virtual ICollection<FinRoeoverride> FinRoeoverrides { get; set; } = new List<FinRoeoverride>();

    public virtual CmpUser? FinchargeRoeAppliedByNavigation { get; set; }

    public virtual JobCostingChargesIn? FinchargeRoeChargeIn { get; set; }

    public virtual JobCostingChargesOut? FinchargeRoeChargeOut { get; set; }

    public virtual FinDocumentLine? FinchargeRoeDocumentLine { get; set; }

    public virtual JobHeader? FinchargeRoeJob { get; set; }

    public virtual FinJobRoeline? FinchargeRoeJobRoeline { get; set; }

    public virtual FinExchangeRate? FinchargeRoeProviderRate { get; set; }

    public virtual SysFinanceRoetype FinchargeRoeRoetypeCodeNavigation { get; set; } = null!;

    public virtual FinVesselRoeline? FinchargeRoeVesselRoeline { get; set; }
}
