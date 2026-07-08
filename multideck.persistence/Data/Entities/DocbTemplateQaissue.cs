using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplateQaissue
{
    public Guid DocbqaiId { get; set; }

    public Guid DocbqaiQarunId { get; set; }

    public string DocbqaiIssueTypeCode { get; set; } = null!;

    public string DocbqaiSeverityCode { get; set; } = null!;

    public Guid? DocbqaiTemplateSectionId { get; set; }

    public Guid? DocbqaiSectionLayoutRowId { get; set; }

    public Guid? DocbqaiSectionLayoutCellId { get; set; }

    public Guid? DocbqaiSectionLayoutBlockId { get; set; }

    public int? DocbqaiPageNo { get; set; }

    public string? DocbqaiFieldPath { get; set; }

    public string DocbqaiMessage { get; set; } = null!;

    public string? DocbqaiFixSuggestion { get; set; }

    public string DocbqaiBoundingBoxJson { get; set; } = null!;

    public string DocbqaiMetadataJson { get; set; } = null!;

    public bool DocbqaiIsResolved { get; set; }

    public DateTime? DocbqaiResolvedAt { get; set; }

    public Guid? DocbqaiResolvedBy { get; set; }

    public DateTime DocbqaiCreatedAt { get; set; }

    public virtual SysDocBuilderQaissueType DocbqaiIssueTypeCodeNavigation { get; set; } = null!;

    public virtual DocbTemplateQarun DocbqaiQarun { get; set; } = null!;

    public virtual CmpUser? DocbqaiResolvedByNavigation { get; set; }

    public virtual DocbSectionLayoutBlock? DocbqaiSectionLayoutBlock { get; set; }

    public virtual DocbSectionLayoutCell? DocbqaiSectionLayoutCell { get; set; }

    public virtual DocbSectionLayoutRow? DocbqaiSectionLayoutRow { get; set; }

    public virtual SysDocBuilderQaseverity DocbqaiSeverityCodeNavigation { get; set; } = null!;

    public virtual DocbTemplateSection? DocbqaiTemplateSection { get; set; }
}
