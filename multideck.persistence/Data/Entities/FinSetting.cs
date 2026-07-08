using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinSetting
{
    public Guid FinsetId { get; set; }

    public Guid? FinsetLegalEntityId { get; set; }

    public Guid? FinsetOrgOfficeId { get; set; }

    public Guid? FinsetBrandId { get; set; }

    public string FinsetBaseCurrencyCode { get; set; } = null!;

    public string FinsetDefaultOperatingModelCode { get; set; } = null!;

    public bool FinsetAutoCreateSalesInvoices { get; set; }

    public bool FinsetAutoCreatePurchaseAccruals { get; set; }

    public bool FinsetAutoPostLowRiskItems { get; set; }

    public bool FinsetUseAccountingDateRules { get; set; }

    public bool FinsetBlockLockedPeriodDirectPosting { get; set; }

    public string? FinsetDefaultRoeproviderCode { get; set; }

    public bool FinsetIncludeFxinOperationalProfit { get; set; }

    public string FinsetSettingsJson { get; set; } = null!;

    public DateTime FinsetCreatedAt { get; set; }

    public Guid? FinsetCreatedBy { get; set; }

    public DateTime FinsetUpdatedAt { get; set; }

    public Guid? FinsetUpdatedBy { get; set; }

    public virtual CmpBrand? FinsetBrand { get; set; }

    public virtual CmpUser? FinsetCreatedByNavigation { get; set; }

    public virtual SysFinanceOperatingModel FinsetDefaultOperatingModelCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? FinsetLegalEntity { get; set; }

    public virtual CmpOffice? FinsetOrgOffice { get; set; }

    public virtual CmpUser? FinsetUpdatedByNavigation { get; set; }
}
