using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbSectionDefinition
{
    public Guid DocbsId { get; set; }

    public string DocbsCode { get; set; } = null!;

    public string DocbsName { get; set; } = null!;

    public string DocbsSectionTypeCode { get; set; } = null!;

    public string DocbsDataScopeCode { get; set; } = null!;

    public Guid? DocbsDataSourceId { get; set; }

    public string DocbsStatusCode { get; set; } = null!;

    public int DocbsCurrentVersionNo { get; set; }

    public string? DocbsCategory { get; set; }

    public string? DocbsDescription { get; set; }

    public string DocbsContentJson { get; set; } = null!;

    public string DocbsDefaultConfigJson { get; set; } = null!;

    public string DocbsDefaultConditionJson { get; set; } = null!;

    public bool DocbsIsSystem { get; set; }

    public bool DocbsIsUserEditable { get; set; }

    public bool DocbsIsActive { get; set; }

    public DateTime DocbsCreatedAt { get; set; }

    public Guid? DocbsCreatedBy { get; set; }

    public DateTime DocbsUpdatedAt { get; set; }

    public Guid? DocbsUpdatedBy { get; set; }

    public virtual ICollection<DocbSectionLayoutBlock> DocbSectionLayoutBlocks { get; set; } = new List<DocbSectionLayoutBlock>();

    public virtual ICollection<DocbSectionVersion> DocbSectionVersions { get; set; } = new List<DocbSectionVersion>();

    public virtual ICollection<DocbTemplatePage> DocbTemplatePageDocbpgFooterSections { get; set; } = new List<DocbTemplatePage>();

    public virtual ICollection<DocbTemplatePage> DocbTemplatePageDocbpgHeaderSections { get; set; } = new List<DocbTemplatePage>();

    public virtual ICollection<DocbTemplateSection> DocbTemplateSections { get; set; } = new List<DocbTemplateSection>();

    public virtual CmpUser? DocbsCreatedByNavigation { get; set; }

    public virtual SysDocBuilderDataScope DocbsDataScopeCodeNavigation { get; set; } = null!;

    public virtual DocbDataSource? DocbsDataSource { get; set; }

    public virtual SysDocBuilderSectionType DocbsSectionTypeCodeNavigation { get; set; } = null!;

    public virtual SysDocBuilderStatus DocbsStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? DocbsUpdatedByNavigation { get; set; }
}
