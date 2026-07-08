using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbClauseLibrary
{
    public Guid DocbclId { get; set; }

    public string DocbclCode { get; set; } = null!;

    public string DocbclTitle { get; set; } = null!;

    public string? DocbclDataScopeCode { get; set; }

    public string DocbclStatusCode { get; set; } = null!;

    public string DocbclLanguageCode { get; set; } = null!;

    public Guid? DocbclOrgOfficeId { get; set; }

    public Guid? DocbclLegalEntityId { get; set; }

    public Guid? DocbclBrandId { get; set; }

    public Guid? DocbclCustomerOrgId { get; set; }

    public string DocbclBodyText { get; set; } = null!;

    public string DocbclMetadataJson { get; set; } = null!;

    public DateTime DocbclCreatedAt { get; set; }

    public Guid? DocbclCreatedBy { get; set; }

    public DateTime DocbclUpdatedAt { get; set; }

    public Guid? DocbclUpdatedBy { get; set; }

    public virtual ICollection<DocbSectionLayoutBlock> DocbSectionLayoutBlocks { get; set; } = new List<DocbSectionLayoutBlock>();

    public virtual ICollection<DocbTemplateClauseLink> DocbTemplateClauseLinks { get; set; } = new List<DocbTemplateClauseLink>();

    public virtual CmpBrand? DocbclBrand { get; set; }

    public virtual CmpUser? DocbclCreatedByNavigation { get; set; }

    public virtual OrgMaster? DocbclCustomerOrg { get; set; }

    public virtual SysDocBuilderDataScope? DocbclDataScopeCodeNavigation { get; set; }

    public virtual CmpLegalEntity? DocbclLegalEntity { get; set; }

    public virtual CmpOffice? DocbclOrgOffice { get; set; }

    public virtual SysDocBuilderStatus DocbclStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? DocbclUpdatedByNavigation { get; set; }
}
