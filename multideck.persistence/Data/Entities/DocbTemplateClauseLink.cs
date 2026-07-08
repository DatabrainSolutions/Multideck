using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplateClauseLink
{
    public Guid DocbtclId { get; set; }

    public Guid DocbtclTemplateVersionId { get; set; }

    public Guid? DocbtclTemplateSectionId { get; set; }

    public Guid DocbtclClauseId { get; set; }

    public int DocbtclSortOrder { get; set; }

    public string DocbtclConditionJson { get; set; } = null!;

    public virtual DocbClauseLibrary DocbtclClause { get; set; } = null!;

    public virtual DocbTemplateSection? DocbtclTemplateSection { get; set; }

    public virtual DocbTemplateVersion DocbtclTemplateVersion { get; set; } = null!;
}
