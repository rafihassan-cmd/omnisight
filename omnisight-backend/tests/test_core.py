import io

import pandas as pd
import pytest

from omnisight.core.errors import CleaningError
from omnisight.core.io import load_csv
from omnisight.core.missing import apply_missing, preview_missing
from omnisight.core.operations import apply_operation, describe_operations
from omnisight.core.profiling import column_names, duplicate_groups, preview
from omnisight.core.transforms import discard_column, preview_affix, remove_affix, rename_column


def read(text):
    return load_csv(io.BytesIO(text.encode()))


def test_original_headers_and_cells_are_preserved():
    df = read('Name,Age,Age,age,Age ,Age.1\n Alice ,22,23,24,25,26\n')
    assert list(column_names(df).values()) == ['Name', 'Age', 'Age', 'age', 'Age ', 'Age.1']
    assert duplicate_groups(df) == [{'name': 'Age', 'column_ids': ['c1', 'c2']}]
    assert df['c0'].iloc[0] == ' Alice '
    assert preview(df)['rows'][0]['c1'] == 22
    assert preview(df)['rows'][0]['c2'] == 23


def test_quoted_multiline_headers_and_bom():
    df = read('\ufeff"First, name","Multi\nline","Multi\nline"\nAlice,1,2\n')
    assert column_names(df)['c0'] == 'First, name'
    assert duplicate_groups(df)[0]['column_ids'] == ['c1', 'c2']


@pytest.mark.parametrize('csv', ['', '\n', 'a,b\n1,2,3\n', 'a,b\n1\n'])
def test_invalid_csv_does_not_silently_drop_values(csv):
    with pytest.raises(CleaningError):
        read(csv)


def test_resolving_one_of_three_duplicates_keeps_other_conflicts_and_ids():
    df = read('A,A,A,B\n1,2,3,4\n')
    renamed = rename_column(df, 'c1', 'Second')
    assert duplicate_groups(renamed)[0]['column_ids'] == ['c0', 'c2']
    discarded = discard_column(renamed, 'c0')
    assert list(discarded.columns) == ['c1', 'c2', 'c3']
    assert not duplicate_groups(discarded)
    assert column_names(df)['c1'] == 'A'
    assert renamed['c1'].iloc[0] == 2
    with pytest.raises(CleaningError):
        rename_column(df, 'c0', 'B')
    with pytest.raises(CleaningError):
        rename_column(df, 'c0', '  ')
    with pytest.raises(CleaningError):
        discard_column(df, 'c3')


def test_exact_affix_only_and_null_preservation():
    df = read('price\n$12\n12$\n$$4\n""\n')
    prefix = remove_affix(df, 'c0', 'prefix', '$')
    assert prefix['c0'].iloc[:3].tolist() == ['12', '12$', '$4']
    assert prefix['c0'].isna().sum() == 1
    suffix = remove_affix(df, 'c0', 'suffix', '$')
    assert suffix['c0'].iloc[:3].tolist() == ['$12', '12', '$$4']
    assert df['c0'].iloc[0] == '$12'


@pytest.mark.parametrize('bad', ['abc', '1,250.50', '', 'inf', '1e999', 'NaN'])
def test_conversion_rejects_invalid_and_new_empty_values_without_mutating(bad):
    df = pd.DataFrame({'c0': ['$12', '$' + bad, None]})
    before = df.copy(deep=True)
    with pytest.raises(CleaningError) as exc:
        remove_affix(df, 'c0', 'prefix', '$', True)
    assert exc.value.details['invalid_rows'][0]['row'] == 2
    pd.testing.assert_frame_equal(df, before)


def test_nullable_numeric_and_dryrun_match_apply():
    df = read('price\n$-2.5\n$3e2\n""\n')
    before = df.copy(deep=True)
    result = preview_affix(df, 'c0', 'prefix', '$', True)
    out = remove_affix(df, 'c0', 'prefix', '$', True)
    assert pd.api.types.is_numeric_dtype(out['c0'])
    assert out['c0'].iloc[:2].tolist() == [-2.5, 300]
    assert out['c0'].isna().sum() == 1
    assert result['sample'][2]['after'] is None
    pd.testing.assert_frame_equal(df, before)


def test_large_integer_with_null_does_not_lose_precision():
    df = read('p\n$9007199254740993\n""\n')
    out = remove_affix(df, 'c0', 'prefix', '$', True)
    assert int(out['c0'].iloc[0]) == 9007199254740993


def test_missing_value_strategies_still_work_after_nullable_integer_conversion():
    df = remove_affix(read('p\n$1\n$2\n""\n$4\n'), 'c0', 'prefix', '$', True)
    result = preview_missing(df, ['c0'], 'mean')
    out = apply_missing(df, ['c0'], 'mean')
    assert result['affected_rows'] == 1
    assert out['c0'].iloc[2] == pytest.approx(7 / 3)


@pytest.mark.parametrize('strategy', ['mean', 'median', 'mode', 'fill', 'drop'])
def test_existing_part2_preview_and_apply_agree(strategy):
    df = read('n,city\n1,a\n,b\n3,c\n')
    before = df.copy(deep=True)
    result = preview_missing(df, ['c0'], strategy, value='9')
    out = apply_missing(df, ['c0'], strategy, value='9')
    assert result['rows_after'] == len(out)
    if strategy != 'drop':
        assert result['sample'][0]['c0__new'] == pytest.approx(out['c0'].iloc[1])
    pd.testing.assert_frame_equal(df, before)


def test_registry_scope_and_part2_gate():
    assert set(describe_operations()['operations']) == {
        'rename_column', 'discard_column', 'remove_affix', 'handle_missing'}
    with pytest.raises(CleaningError, match='Part 2'):
        apply_operation(read('A,A\n,2\n'), 'handle_missing', {'columns': ['c0'], 'strategy': 'drop'})
    with pytest.raises(CleaningError, match='Invalid parameters'):
        apply_operation(read('A\n1\n'), 'remove_affix', {'wrong': 1})
