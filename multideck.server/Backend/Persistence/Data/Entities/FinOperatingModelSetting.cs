using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinOperatingModelSetting
{
    public Guid FinomsId { get; set; }

    public string FinomsCode { get; set; } = null!;

    public string FinomsName { get; set; } = null!;

    public string FinomsModelCode { get; set; } = null!;

    public Guid? FinomsLegalEntityId { get; set; }

    public Guid? FinomsOrgOfficeId { get; set; }

    public Guid? FinomsBrandId { get; set; }

    public Guid? FinomsCustomerOrgId { get; set; }

    public string? FinomsModeCode { get; set; }

    public string? FinomsDirectionCode { get; set; }

    public string? FinomsJobTypeCode { get; set; }

    public bool FinomsCanOpsCreateInvoice { get; set; }

    public bool FinomsCanOpsPostInvoice { get; set; }

    public bool FinomsCanOpsApproveSupplierInvoice { get; set; }

    public int FinomsPriority { get; set; }

    public bool FinomsIsActive { get; set; }

    public DateOnly FinomsEffectiveFrom { get; set; }

    public DateOnly? FinomsEffectiveTo { get; set; }

    public DateTime FinomsCreatedAt { get; set; }

    public Guid? FinomsCreatedBy { get; set; }

    public virtual CmpBrand? FinomsBrand { get; set; }

    public virtual CmpUser? FinomsCreatedByNavigation { get; set; }

    public virtual OrgMaster? FinomsCustomerOrg { get; set; }

    public virtual CmpLegalEntity? FinomsLegalEntity { get; set; }

    public virtual SysFinanceOperatingModel FinomsModelCodeNavigation { get; set; } = null!;

    public virtual CmpOffice? FinomsOrgOffice { get; set; }
}
