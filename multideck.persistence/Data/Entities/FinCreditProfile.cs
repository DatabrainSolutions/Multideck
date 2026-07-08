using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCreditProfile
{
    public Guid FincreditProfileId { get; set; }

    public Guid FincreditProfileCustomerOrgId { get; set; }

    public Guid? FincreditProfileLegalEntityId { get; set; }

    public Guid? FincreditProfileOrgOfficeId { get; set; }

    public Guid? FincreditProfilePaymentTermId { get; set; }

    public decimal FincreditProfileCreditLimitAmount { get; set; }

    public string FincreditProfileCurrencyCodeSnapshot { get; set; } = null!;

    public string FincreditProfileFlexibilityLevelCode { get; set; } = null!;

    public bool FincreditProfileOnStop { get; set; }

    public string? FincreditProfileStopReason { get; set; }

    public string? FincreditProfileInsuranceStatusCode { get; set; }

    public int FincreditProfileChaseEarlyDays { get; set; }

    public bool FincreditProfileIsActive { get; set; }

    public DateTime FincreditProfileUpdatedAt { get; set; }

    public Guid? FincreditProfileUpdatedBy { get; set; }

    public virtual OrgMaster FincreditProfileCustomerOrg { get; set; } = null!;

    public virtual SysFinanceCustomerFlexibilityLevel FincreditProfileFlexibilityLevelCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? FincreditProfileLegalEntity { get; set; }

    public virtual CmpOffice? FincreditProfileOrgOffice { get; set; }

    public virtual FinPaymentTerm? FincreditProfilePaymentTerm { get; set; }

    public virtual CmpUser? FincreditProfileUpdatedByNavigation { get; set; }
}
