using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMessageTemplate
{
    public Guid CommTemplateId { get; set; }

    public string CommTemplateCode { get; set; } = null!;

    public string CommTemplateName { get; set; } = null!;

    public string? CommTemplateDescription { get; set; }

    public string CommTemplateChannelCode { get; set; } = null!;

    public string CommTemplateStatusCode { get; set; } = null!;

    public string? CommTemplateCategory { get; set; }

    public string CommTemplateLanguageCode { get; set; } = null!;

    public Guid? CommTemplateOrgOfficeId { get; set; }

    public Guid? CommTemplateLegalEntityId { get; set; }

    public Guid? CommTemplateBrandId { get; set; }

    public Guid? CommTemplateCustomerOrgId { get; set; }

    public Guid? CommTemplateCurrentVersionId { get; set; }

    public string CommTemplateDefaultSensitivityCode { get; set; } = null!;

    public bool CommTemplateIsSystem { get; set; }

    public string CommTemplateMetadataJson { get; set; } = null!;

    public DateTime CommTemplateCreatedAt { get; set; }

    public Guid? CommTemplateCreatedBy { get; set; }

    public DateTime CommTemplateUpdatedAt { get; set; }

    public Guid? CommTemplateUpdatedBy { get; set; }

    public virtual ICollection<CommMessageTemplateVersion> CommMessageTemplateVersions { get; set; } = new List<CommMessageTemplateVersion>();

    public virtual CmpBrand? CommTemplateBrand { get; set; }

    public virtual SysCommChannel CommTemplateChannelCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommTemplateCreatedByNavigation { get; set; }

    public virtual CommMessageTemplateVersion? CommTemplateCurrentVersion { get; set; }

    public virtual OrgMaster? CommTemplateCustomerOrg { get; set; }

    public virtual SysCommSensitivityLevel CommTemplateDefaultSensitivityCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? CommTemplateLegalEntity { get; set; }

    public virtual CmpOffice? CommTemplateOrgOffice { get; set; }

    public virtual SysCommTemplateStatus CommTemplateStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommTemplateUpdatedByNavigation { get; set; }
}
